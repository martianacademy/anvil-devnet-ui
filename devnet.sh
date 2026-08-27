#!/usr/bin/env bash
# Anvil DevNet + Blockscout — one script to run the whole stack.
#
#   ./devnet.sh up          start Blockscout (docker), the control API and the explorer UI
#   ./devnet.sh down        stop the UI, the control API and the Blockscout containers
#   ./devnet.sh reset       wipe the indexer database and reindex from a fresh chain
#   ./devnet.sh status      show what is running
#   ./devnet.sh logs        tail the control API + explorer logs
#   ./devnet.sh local       address everything as localhost
#   ./devnet.sh expose [ip] address everything as your LAN address
#   ./devnet.sh proxy       put the explorer, the API and the RPC on one origin
#   ./devnet.sh tunnel      address everything as public HTTPS (Cloudflare quick tunnel)
#   ./devnet.sh domain <host>  address everything as a hostname you already serve
#   ./devnet.sh reconnect   bring the public address back without touching the stack
#   ./devnet.sh fork <url>  fork a chain and reindex the explorer for it
#
# Add --docker to `up`, `down`, `reset` or `status` to run the control API, the
# node and the explorer UI as containers too — then Docker is all you need
# installed. Without it they run as host processes (Bun, pnpm and Foundry).
#
# Ports: 3000 explorer UI (Blockscout frontend fork) · 3010 DevNet Control API
#        80 Blockscout backend/API via nginx · ${DEVNET_RPC_PORT} the Anvil node
set -euo pipefail

# Resolve through symlinks so the script works when linked from the workspace root.
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  LINK_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$LINK_DIR/$SOURCE"
done
CONTROL_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
# Blockscout is cloned next to this repo (see stack/setup.sh), not inside it.
WORKSPACE="${DEVNET_WORKSPACE:-$(dirname "$CONTROL_DIR")}"
COMPOSE_DIR="$WORKSPACE/blockscout/docker-compose"
FRONTEND_DIR="$WORKSPACE/blockscout-frontend"
LOG_DIR="$WORKSPACE/.devnet-logs"

# 8545 is Anvil's own default, which is what every wallet, script and tutorial
# already assumes. The container path publishes it from inside devnet-api, so a
# node you started by hand on the host does not collide; on the from-source path
# it can, and DEVNET_RPC_PORT moves it.
export DEVNET_RPC_PORT="${DEVNET_RPC_PORT:-8545}"
export DEVNET_CHAIN_ID="${DEVNET_CHAIN_ID:-31337}"
export DEVNET_API_PORT="${DEVNET_API_PORT:-3010}"
# Blockscout indexes from here; a fork must set it or the catchup indexer walks
# every block from genesis.
export DEVNET_FIRST_BLOCK="${DEVNET_FIRST_BLOCK:-0}"
# Port the single-origin front door listens on (devnet.sh proxy / tunnel).
export DEVNET_PROXY_PORT="${DEVNET_PROXY_PORT:-8000}"

# --docker anywhere in the arguments runs everything in containers.
DOCKER_MODE=0
ARGS=()
for arg in "$@"; do
  if [ "$arg" = "--docker" ]; then DOCKER_MODE=1; else ARGS+=("$arg"); fi
done
set -- "${ARGS[@]+"${ARGS[@]}"}"

# --docker says how to *start* things. Every other command acts on a stack that
# is already running, and what matters there is how it is running — not what was
# typed. Asking the containers removes a flag people have to remember, and with
# it a whole class of "it worked, but through the wrong path".
case "${1:-up}" in
  up|reset) ;;
  *)
    if [ "$DOCKER_MODE" = "0" ] && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx devnet-api; then
      DOCKER_MODE=1
    fi
    ;;
esac

# Both are read by stack/docker-compose/devnet-stack.yml.
export DEVNET_COMPOSE_DIR="$COMPOSE_DIR"
# Echoed back in hints so copy-pasted commands keep the mode the user is in.
DOCKER_SUFFIX=""
[ "$DOCKER_MODE" = "1" ] && DOCKER_SUFFIX=" --docker"
export DEVNET_REPO_DIR="$CONTROL_DIR"

# The containerised control API cannot see this machine's LAN address, so hand it over.
DEVNET_HOST_IP="${DEVNET_HOST_IP:-}"
export DEVNET_HOST_IP

# The single-origin file applies to both paths, so it is added on demand rather
# than living in the --docker file set.
compose_proxy() {
  DEVNET_WITH_PROXY=1 compose "$@"
}

compose() {
  local files=(-f "$COMPOSE_DIR/anvil.yml" -f "$COMPOSE_DIR/devnet.override.yml")
  [ "${DEVNET_WITH_PROXY:-0}" = "1" ] && files+=(-f "$COMPOSE_DIR/devnet-proxy.yml")
  if [ "$DOCKER_MODE" = "1" ]; then
    files+=(-f "$COMPOSE_DIR/devnet-stack.yml")
    # Anvil runs inside the control API container, so that is the host the
    # indexer must reach it on rather than the Docker host.
    export DEVNET_RPC_HOST=devnet-api
  fi
  docker compose "${files[@]}" "$@"
}

wait_for() { # url, label, attempts
  local url="$1" label="$2" attempts="${3:-60}"
  for _ in $(seq 1 "$attempts"); do
    if curl -sf -m 3 -o /dev/null "$url"; then
      echo "  ✓ $label"
      return 0
    fi
    sleep 3
  done
  echo "  ✗ $label did not come up: $url" >&2
  return 1
}

start_anvil() {
  if curl -sf -m 2 -o /dev/null -X POST "http://127.0.0.1:$DEVNET_RPC_PORT" \
      -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'; then
    echo "  ✓ anvil already listening on $DEVNET_RPC_PORT"
    return
  fi
  # --host 0.0.0.0 so the Blockscout containers can reach it via host.docker.internal;
  # nohup so it outlives the shell that ran this script.
  #
  # --block-time 15 rather than 2: time still moves for contracts that depend on
  # it, but a chain left running writes a seventh as many empty blocks, each of
  # which costs about 1.7 KB in the state dump. DEVNET_BLOCK_TIME=0 mines only on
  # transactions, and then anything time-dependent needs /api/anvil/time.
  nohup anvil --host 0.0.0.0 --port "$DEVNET_RPC_PORT" --chain-id "$DEVNET_CHAIN_ID" \
        --block-time "${DEVNET_BLOCK_TIME:-15}" --steps-tracing > "$LOG_DIR/anvil.log" 2>&1 &
  sleep 3
  echo "  ✓ anvil started on $DEVNET_RPC_PORT"
}

cmd_up_docker() {
  # Detected here rather than at the top: detect_lan_ip is defined further down,
  # and an address picked up at boot goes stale when the laptop changes network.
  [ -n "$DEVNET_HOST_IP" ] || DEVNET_HOST_IP="$(detect_lan_ip)"
  export DEVNET_HOST_IP

  if [ ! -d "$COMPOSE_DIR" ]; then
    echo "🚨 Blockscout's compose files are missing — run ./stack/setup.sh --docker first." >&2
    exit 1
  fi
  mkdir -p "$LOG_DIR"

  echo "→ building the explorer UI (first run takes a while — it compiles Blockscout's frontend)"
  compose build devnet-ui

  # `compose up` only builds an image that is missing, so a control API changed
  # since the last run would silently keep serving the old one.
  if [ "${DEVNET_REBUILD_API:-0}" = "1" ]; then
    echo "→ rebuilding the control API image"
    compose build devnet-api
  fi

  echo "→ containers"
  compose up -d
  wait_for "http://localhost/api/v2/config/backend-version" "blockscout api" 120 || {
    docker restart proxy >/dev/null
    wait_for "http://localhost/api/v2/config/backend-version" "blockscout api (after proxy restart)" 40
  }
  wait_for "http://localhost:$DEVNET_API_PORT/api/anvil/status" "control api" 60
  wait_for "http://localhost:3000/" "explorer ui" 90

  echo
  echo "Explorer:     http://localhost:3000"
  echo "DevNet pages: http://localhost:3000/devnet"
  echo "Blockscout API: http://localhost/api/v2"
  echo "RPC:          http://127.0.0.1:$DEVNET_RPC_PORT  (started from the /devnet page)"
}

cmd_up() {
  if [ "$DOCKER_MODE" = "1" ]; then cmd_up_docker; return; fi

  if [ ! -d "$COMPOSE_DIR" ] || [ ! -d "$FRONTEND_DIR" ]; then
    echo "🚨 Blockscout is not set up yet — run ./stack/setup.sh first." >&2
    exit 1
  fi
  mkdir -p "$LOG_DIR"
  echo "→ anvil"
  start_anvil

  echo "→ blockscout containers"
  compose up -d
  wait_for "http://localhost/api/v2/config/backend-version" "blockscout api" 120 || {
    # nginx caches the upstream IP at boot; a backend restart leaves it pointing at a dead one.
    docker restart proxy >/dev/null
    wait_for "http://localhost/api/v2/config/backend-version" "blockscout api (after proxy restart)" 40
  }

  echo "→ devnet control api (port $DEVNET_API_PORT)${DEVNET_READONLY:+ · read-only}"
  (cd "$CONTROL_DIR" && DEVNET_API_PORT="$DEVNET_API_PORT" DEVNET_RPC_PORT="$DEVNET_RPC_PORT" \
    bun dev > "$LOG_DIR/control-api.log" 2>&1 &)
  wait_for "http://localhost:$DEVNET_API_PORT/api/anvil/status" "control api" 40

  echo "→ explorer ui (port 3000)"
  (cd "$FRONTEND_DIR" && pnpm dev:local > "$LOG_DIR/frontend.log" 2>&1 &)
  wait_for "http://localhost:3000/" "explorer ui" 80

  echo
  echo "Explorer:     http://localhost:3000"
  echo "DevNet pages: http://localhost:3000/devnet"
  echo "Blockscout API: http://localhost/api/v2"
  echo "RPC:          http://127.0.0.1:$DEVNET_RPC_PORT"
}

cmd_down() {
  if [ "$DOCKER_MODE" != "1" ]; then
    pkill -f "next dev -p $DEVNET_API_PORT" 2>/dev/null || true
    pkill -f "next dev -p 3000" 2>/dev/null || true
  fi
  compose down --timeout 30
  echo "Stopped the UI, the control API and the Blockscout containers."
}

cmd_reset() {
  # Blockscout indexes by block height. When anvil restarts at block 0 the indexer
  # keeps serving the old chain's rows, so the database has to go with it.
  echo "This wipes the Blockscout index AND the devnet state for chain $DEVNET_CHAIN_ID."
  read -r -p "Continue? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }

  curl -sf -m 30 -X POST "http://localhost:$DEVNET_API_PORT/api/anvil/reset" \
    -H 'content-type: application/json' -d "{\"chainId\":$DEVNET_CHAIN_ID}" >/dev/null || true

  compose down -v --timeout 30
  # Blockscout keeps Postgres in bind mounts, which `down -v` does not remove.
  rm -rf "$COMPOSE_DIR/services/blockscout-db-data" "$COMPOSE_DIR/services/stats-db-data" "$COMPOSE_DIR/services/dets"
  if [ "$DOCKER_MODE" != "1" ]; then
    pkill -f "anvil --host 0.0.0.0 --port $DEVNET_RPC_PORT" 2>/dev/null || true
  fi
  sleep 2
  cmd_up
}

cmd_status() {
  # Ask the control API rather than assuming DEVNET_RPC_PORT: it reports the port
  # the node is actually on, which is the whole point of it discovering nodes.
  local status node_port
  status="$(curl -sf -m 3 "http://localhost:$DEVNET_API_PORT/api/anvil/status" 2>/dev/null || true)"
  node_port="$(active_node_port)"

  printf 'anvil (%s):   ' "$node_port"
  curl -sf -m 3 -o /dev/null -X POST "http://127.0.0.1:$node_port" \
    -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' && echo "up" || echo "down"
  printf 'control api:  '
  [ -n "$status" ] && echo "up" || echo "down"
  printf 'blockscout:   '
  curl -sf -m 3 -o /dev/null "http://localhost/api/v2/config/backend-version" && echo "up" || echo "down"
  printf 'explorer ui:  '
  curl -sf -m 3 -o /dev/null "http://localhost:3000/" && echo "up" || echo "down"

  # A dead tunnel is invisible otherwise: the addressing below still names its
  # hostname, and every local check passes, while the shared URL answers nothing.
  if [ -f "$TUNNEL_STATE" ]; then
    echo
    while read -r pid name; do
      [ -n "$pid" ] || continue
      local url
      url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_DIR/tunnel-$name.log" 2>/dev/null | head -1)"
      if kill -0 "$pid" 2>/dev/null; then
        printf '  tunnel %-8s up    %s\n' "$name" "$url"
      else
        printf '  tunnel %-8s DOWN  %s\n' "$name" "(exited — ./devnet.sh tunnel${DOCKER_SUFFIX} to reopen)"
      fi
    done < "$TUNNEL_STATE"
  fi

  # What the explorer is telling browsers right now, straight from what it serves.
  local envs app_host api_host rpc
  envs="$(curl -sf -m 3 http://localhost:3000/assets/envs.js 2>/dev/null || true)"
  app_host="$(printf '%s' "$envs" | sed -n 's/.*NEXT_PUBLIC_APP_HOST: "\([^"]*\)".*/\1/p' | head -1)"
  api_host="$(printf '%s' "$envs" | sed -n 's/.*NEXT_PUBLIC_API_HOST: "\([^"]*\)".*/\1/p' | head -1)"
  rpc="$(printf '%s' "$envs" | sed -n 's/.*NEXT_PUBLIC_NETWORK_RPC_URL: "\([^"]*\)".*/\1/p' | head -1)"
  if [ -n "$app_host" ]; then
    echo
    echo "  Addressed as — what the explorer tells a browser to call:"
    printf '  %-13s %s\n' "explorer" "$app_host"
    printf '  %-13s %s\n' "blockscout" "$api_host"
    printf '  %-13s %s\n' "rpc" "$rpc"
  fi

  local ip
  ip="$(detect_lan_ip)"
  if [ -n "$ip" ]; then
    echo
    echo "  Listening on:"
    printf '  %-13s %-28s %s\n' "" "this machine" "your network"
    printf '  %-13s %-28s %s\n' "Explorer" "http://localhost:3000" "http://$ip:3000"
    printf '  %-13s %-28s %s\n' "RPC" "http://127.0.0.1:$node_port" "http://$ip:$node_port"
    printf '  %-13s %-28s %s\n' "Explorer API" "http://localhost/api/v2" "http://$ip/api/v2"
    echo
    echo "  Switch addressing with: ./devnet.sh local|expose|tunnel${DOCKER_SUFFIX}"
  fi

  echo
  compose ps --format 'table {{.Name}}\t{{.Status}}' 2>/dev/null || true
}

cmd_logs() {
  tail -f "$LOG_DIR"/*.log
}

# The port the node is really on. DEVNET_RPC_PORT is only the default used when
# starting one; the control API discovers whatever is actually listening, and
# reporting the configured port instead sends people to a dead address.
active_node_field() { # field, fallback
  local status value
  status="$(curl -sf -m 3 "http://localhost:$DEVNET_API_PORT/api/anvil/status" 2>/dev/null || true)"
  value="$(printf '%s' "$status" | sed -n "s/.*\"$1\":\([0-9]*\).*/\1/p" | head -1)"
  echo "${value:-$2}"
}

active_node_port() { active_node_field port "$DEVNET_RPC_PORT"; }
active_node_chain() { active_node_field chainId "$DEVNET_CHAIN_ID"; }

detect_lan_ip() {
  local ip
  for iface in en0 en1 en2 eth0; do
    ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    [ -n "$ip" ] && { echo "$ip"; return; }
  done
  # Linux fallback
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo "$ip"
}

# ── how the explorer is addressed from outside ───────────────────────────────
#
# `local`, `expose` and `tunnel` are the same operation with different answers to
# one question: what URLs will a *browser* use? Everything the visitor's browser
# touches — the app itself, the Blockscout API, the RPC a wallet is handed — has
# to be reachable from where they are, not just from this machine. So there is
# one function that applies a complete set, and three commands that fill it in.
#
# The port arguments are deliberately allowed to be empty: behind a tunnel or a
# reverse proxy the port is part of the scheme and must not appear in the URL.
TUNNEL_STATE="$LOG_DIR/tunnels"

apply_public_config() { # app_proto app_host app_port api_proto api_host api_port ws_proto rpc_url
  export DEVNET_PUBLIC_PROTOCOL="$1" DEVNET_PUBLIC_HOST="$2" DEVNET_PUBLIC_PORT="$3"
  export DEVNET_API_PROTOCOL="$4" DEVNET_API_PUBLIC_HOST="$5" DEVNET_API_PUBLIC_PORT="$6"
  export DEVNET_WS_PROTOCOL="$7" DEVNET_PUBLIC_RPC_URL="$8"

  if [ "$DOCKER_MODE" = "1" ]; then
    # The containerised UI has no .env.local — its public URLs come from compose,
    # so applying them means recreating that one container. --no-deps keeps it
    # from restarting the control API underneath itself.
    compose up -d --force-recreate --no-deps --pull never devnet-ui >/dev/null
  else
    write_frontend_env
  fi
  wait_for "http://localhost:3000/" "explorer ui" 90
  refresh_front_door
}

# nginx resolves an upstream hostname once, at startup, and then holds that
# address. Recreating the explorer or the control API hands them new ones, and
# the front door keeps dialling the old — 502 on /rpc and /api/devnet while the
# explorer itself still works, because that one it reaches through a container
# that did not move.
refresh_front_door() {
  docker ps --format '{{.Names}}' 2>/dev/null | grep -qx devnet-proxy || return 0
  docker restart devnet-proxy >/dev/null 2>&1 || true
  wait_for "http://localhost:$DEVNET_PROXY_PORT/" "front door" 30 || true
}

# The from-source path keeps its values in .env.local and runs its own dev server.
write_frontend_env() {
  local env_file="$FRONTEND_DIR/.env.local"
  [ -f "$env_file" ] || { echo "🚨 $env_file not found — run ./stack/setup.sh first." >&2; exit 1; }

  local tmp
  tmp="$(mktemp)"
  sed -E \
    -e "s|^NEXT_PUBLIC_APP_PROTOCOL=.*|NEXT_PUBLIC_APP_PROTOCOL=${DEVNET_PUBLIC_PROTOCOL}|" \
    -e "s|^NEXT_PUBLIC_APP_HOST=.*|NEXT_PUBLIC_APP_HOST=${DEVNET_PUBLIC_HOST}|" \
    -e "s|^NEXT_PUBLIC_APP_PORT=.*|NEXT_PUBLIC_APP_PORT=${DEVNET_PUBLIC_PORT}|" \
    -e "s|^NEXT_PUBLIC_API_PROTOCOL=.*|NEXT_PUBLIC_API_PROTOCOL=${DEVNET_API_PROTOCOL}|" \
    -e "s|^NEXT_PUBLIC_API_HOST=.*|NEXT_PUBLIC_API_HOST=${DEVNET_API_PUBLIC_HOST}|" \
    -e "s|^NEXT_PUBLIC_API_PORT=.*|NEXT_PUBLIC_API_PORT=${DEVNET_API_PUBLIC_PORT}|" \
    -e "s|^NEXT_PUBLIC_API_WEBSOCKET_PROTOCOL=.*|NEXT_PUBLIC_API_WEBSOCKET_PROTOCOL=${DEVNET_WS_PROTOCOL}|" \
    -e "s|^NEXT_PUBLIC_STATS_API_HOST=.*|NEXT_PUBLIC_STATS_API_HOST=${DEVNET_PUBLIC_PROTOCOL}://${DEVNET_PUBLIC_HOST}:8080|" \
    -e "s|^NEXT_PUBLIC_VISUALIZE_API_HOST=.*|NEXT_PUBLIC_VISUALIZE_API_HOST=${DEVNET_PUBLIC_PROTOCOL}://${DEVNET_PUBLIC_HOST}:8081|" \
    -e "s|^NEXT_PUBLIC_NETWORK_RPC_URL=.*|NEXT_PUBLIC_NETWORK_RPC_URL=${DEVNET_PUBLIC_RPC_URL}|" \
    "$env_file" > "$tmp"
  mv "$tmp" "$env_file"

  pkill -f "next dev -p 3000" 2>/dev/null || true
  sleep 1
  ( cd "$FRONTEND_DIR" && pnpm dev:local > "$LOG_DIR/frontend.log" 2>&1 & )
}

cmd_expose() {
  local host="${1:-$(detect_lan_ip)}"
  [ -n "$host" ] || { echo "🚨 Could not detect a LAN address — pass one: ./devnet.sh expose 192.168.1.42" >&2; exit 1; }

  mkdir -p "$LOG_DIR"
  stop_tunnels
  local port chain
  port="$(active_node_port)"; chain="$(active_node_chain)"
  export DEVNET_HOST_IP="$host"

  echo "→ addressing the explorer as http://$host:3000"
  apply_public_config http "$host" 3000 http "$host" 80 ws "http://$host:$port"

  echo
  echo "Use this address yourself too — while exposed, http://localhost:3000 breaks:"
  echo "  the app calls its own API on $host, and the browser blocks that as cross-origin."
  echo
  echo "Share these on your network:"
  echo "  Explorer:  http://$host:3000"
  echo "  RPC:       http://$host:$port     (chain id $chain)"
  echo "  API:       http://$host/api/v2"
  echo
  echo "⚠️  Anyone who can reach these can also patch balances, write storage and"
  echo "    stop your node — the control API has no authentication."
  echo "    For a shared network, restart it read-only:"
  echo "      ./devnet.sh down${DOCKER_SUFFIX} && DEVNET_READONLY=1 ./devnet.sh up${DOCKER_SUFFIX} && ./devnet.sh expose${DOCKER_SUFFIX}"
  echo "    macOS may prompt to allow incoming connections the first time."
}

rpc_call() { # url, method
  curl -sf -m 15 -X POST "$1" -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"$2\",\"params\":[],\"id\":1}" |
    sed -E 's/.*"result":"?([^",}]*)"?.*/\1/'
}

hex_to_dec() { python3 -c "import sys; print(int(sys.argv[1], 16))" "$1"; }

# Well-known chains, so the explorer shows the right name and ticker.
chain_meta() { # chainId -> "Name|SYMBOL|Currency name"
  case "$1" in
    1) echo "Ethereum Fork|ETH|Ether" ;;
    56) echo "BNB Smart Chain Fork|BNB|BNB" ;;
    137) echo "Polygon Fork|POL|POL" ;;
    204) echo "opBNB Fork|BNB|BNB" ;;
    8453) echo "Base Fork|ETH|Ether" ;;
    42161) echo "Arbitrum Fork|ETH|Ether" ;;
    10) echo "Optimism Fork|ETH|Ether" ;;
    43114) echo "Avalanche Fork|AVAX|Avalanche" ;;
    *) echo "Chain $1 Fork|ETH|Ether" ;;
  esac
}

# Fork a live chain and rebuild the whole stack around it: anvil on the indexed
# port, a fresh Blockscout database for the new chain, and a UI labelled for it.
cmd_fork() {
  local url="${1:-}"
  [ -n "$url" ] || { echo "Usage: ./devnet.sh fork <rpc-url> [chainId]" >&2; exit 1; }

  mkdir -p "$LOG_DIR"

  echo "→ probing $url"
  local chain_hex chain_id
  chain_hex="$(rpc_call "$url" eth_chainId)" || { echo "🚨 Could not reach $url" >&2; exit 1; }
  chain_id="${2:-$(hex_to_dec "$chain_hex")}"
  echo "  ✓ chain id $chain_id"

  echo "→ starting the fork on port $DEVNET_RPC_PORT"
  pkill -f "anvil --host 0.0.0.0 --port $DEVNET_RPC_PORT" 2>/dev/null || true
  sleep 1
  nohup anvil --host 0.0.0.0 --port "$DEVNET_RPC_PORT" --chain-id "$chain_id" \
        --fork-url "$url" --steps-tracing --no-storage-caching \
        > "$LOG_DIR/anvil.log" 2>&1 &

  # A JSON-RPC endpoint rejects the plain GET that wait_for uses, so poll it with
  # an actual call instead.
  local block_hex fork_block
  for _ in $(seq 1 45); do
    block_hex="$(rpc_call "http://127.0.0.1:$DEVNET_RPC_PORT" eth_blockNumber || true)"
    [ -n "$block_hex" ] && break
    sleep 2
  done
  [ -n "$block_hex" ] || { echo "🚨 The fork did not start — see $LOG_DIR/anvil.log" >&2; exit 1; }
  fork_block="$(hex_to_dec "$block_hex")"
  echo "  ✓ forked at block $fork_block"

  echo "→ reindexing Blockscout for chain $chain_id from block $fork_block"
  export DEVNET_CHAIN_ID="$chain_id"
  export DEVNET_FIRST_BLOCK="$fork_block"
  compose down -v --timeout 30 >/dev/null 2>&1 || true
  rm -rf "$COMPOSE_DIR/services/blockscout-db-data" "$COMPOSE_DIR/services/stats-db-data" "$COMPOSE_DIR/services/dets"
  compose up -d
  wait_for "http://localhost/api/v2/config/backend-version" "blockscout api" 120 || {
    docker restart proxy >/dev/null
    wait_for "http://localhost/api/v2/config/backend-version" "blockscout api (after proxy restart)" 40
  }

  local meta name symbol currency
  meta="$(chain_meta "$chain_id")"
  name="${meta%%|*}"; meta="${meta#*|}"
  symbol="${meta%%|*}"; currency="${meta#*|}"

  local env_file="$FRONTEND_DIR/.env.local"
  local tmp; tmp="$(mktemp)"
  sed -E \
    -e "s|^NEXT_PUBLIC_NETWORK_ID=.*|NEXT_PUBLIC_NETWORK_ID=${chain_id}|" \
    -e "s|^NEXT_PUBLIC_NETWORK_NAME=.*|NEXT_PUBLIC_NETWORK_NAME=${name}|" \
    -e "s|^NEXT_PUBLIC_NETWORK_SHORT_NAME=.*|NEXT_PUBLIC_NETWORK_SHORT_NAME=${symbol} Fork|" \
    -e "s|^NEXT_PUBLIC_NETWORK_CURRENCY_NAME=.*|NEXT_PUBLIC_NETWORK_CURRENCY_NAME=${currency}|" \
    -e "s|^NEXT_PUBLIC_NETWORK_CURRENCY_SYMBOL=.*|NEXT_PUBLIC_NETWORK_CURRENCY_SYMBOL=${symbol}|" \
    "$env_file" > "$tmp"
  mv "$tmp" "$env_file"

  echo "→ restarting the control API and the UI"
  pkill -f "next dev -p $DEVNET_API_PORT" 2>/dev/null || true
  sleep 1
  (cd "$CONTROL_DIR" && DEVNET_API_PORT="$DEVNET_API_PORT" DEVNET_RPC_PORT="$DEVNET_RPC_PORT" \
    DEVNET_CHAIN_ID="$chain_id" DEVNET_READONLY="${DEVNET_READONLY:-}" \
    bun dev > "$LOG_DIR/control-api.log" 2>&1 &)
  wait_for "http://localhost:$DEVNET_API_PORT/api/anvil/status" "control api" 40
  restart_frontend

  echo
  echo "$name is live — chain $chain_id, forked at block $fork_block."
  echo "  Explorer: http://localhost:3000"
  echo "  RPC:      http://127.0.0.1:$DEVNET_RPC_PORT"
  echo
  echo "Only blocks from $fork_block onwards are indexed; history stays on the upstream chain."
}

# ── single origin ────────────────────────────────────────────────────────────
#
# One hostname for the explorer, the Blockscout API and the RPC. `devnet-proxy`
# serves /rpc itself and hands everything else to Blockscout's nginx, which
# already splits /api and /socket from the rest — and which now serves this fork
# at "/" rather than the stock frontend.
#
# Worth it beyond tidiness: same-origin means no CORS at all, so the "open it on
# the LAN address, never localhost" caveat disappears, and a tunnel needs one
# hostname instead of three. It is also the shape a cloud deployment behind a
# reverse proxy takes, so the config carries over unchanged.
# Works on both paths: with --docker the explorer and the control API are
# containers on the compose network, without it they are host processes that the
# proxy reaches through host.docker.internal.
single_origin_up() {
  if [ "$DOCKER_MODE" = "1" ]; then
    export DEVNET_FRONT_PROXY_PASS="http://devnet-ui:3000"
    export DEVNET_RPC_PROXY_PASS="${DEVNET_RPC_PROXY_PASS:-http://devnet-api:3010/api/rpc}"
  else
    export DEVNET_FRONT_PROXY_PASS="http://host.docker.internal:3000"
    export DEVNET_RPC_PROXY_PASS="${DEVNET_RPC_PROXY_PASS:-http://host.docker.internal:$DEVNET_API_PORT/api/rpc}"
  fi

  # --pull missing, not never: nginx:alpine is a public base image and may not be
  # here yet, unlike the images this project builds.
  compose_proxy up -d --no-deps --pull missing devnet-proxy >/dev/null
  # Blockscout's nginx has to be recreated to pick up FRONT_PROXY_PASS.
  compose_proxy up -d --force-recreate --no-deps --pull missing proxy >/dev/null
  wait_for "http://localhost:$DEVNET_PROXY_PORT/" "single-origin proxy" 60
}

cmd_proxy() {
  mkdir -p "$LOG_DIR"
  stop_tunnels
  local chain
  chain="$(active_node_chain)"

  echo "→ routing everything through one origin on port $DEVNET_PROXY_PORT"
  single_origin_up
  apply_public_config http localhost "$DEVNET_PROXY_PORT" http localhost "$DEVNET_PROXY_PORT" ws \
    "http://localhost:$DEVNET_PROXY_PORT/rpc"

  echo
  echo "One address for everything:"
  echo "  Explorer:  http://localhost:$DEVNET_PROXY_PORT"
  echo "  DevNet:    http://localhost:$DEVNET_PROXY_PORT/devnet"
  echo "  API:       http://localhost:$DEVNET_PROXY_PORT/api/v2"
  echo "  RPC:       http://localhost:$DEVNET_PROXY_PORT/rpc     (chain id $chain)"
  echo
  echo "  The RPC goes through the control API, which refuses anvil_*, evm_* and"
  echo "  hardhat_* while DEVNET_READONLY=1. Point DEVNET_RPC_PROXY_PASS at"
  echo "  http://devnet-api:8545 for the raw node."
  echo
  echo "  Tunnel this one port to share it: ./devnet.sh tunnel${DOCKER_SUFFIX}"
}

# ── tunnel mode ──────────────────────────────────────────────────────────────
#
# Three separate hostnames, because the browser reaches three different services
# and a quick tunnel maps one hostname to one port. They are HTTPS, which is why
# this mode also fixes the two things a LAN address cannot: wallets that refuse
# plain-HTTP RPC, and anything that is not on your network at all.
#
# --protocol defaults to http2: cloudflared prefers QUIC, and a network that
# blocks UDP/7844 leaves the tunnel registering forever with no useful error.
TUNNEL_PROTOCOL="${DEVNET_TUNNEL_PROTOCOL:-http2}"
# cloudflared gives up after five connection errors by default and exits. On a
# link that drops — a phone hotspot, a laptop changing networks — that ends the
# tunnel silently: the shared URL simply stops answering, with nothing on screen
# to say so. Reconnects inside one process keep the same hostname, so retrying
# for longer is what keeps a shared link working; restarting cloudflared would
# hand out a different one.
TUNNEL_RETRIES="${DEVNET_TUNNEL_RETRIES:-500}"

stop_tunnels() {
  [ -f "$TUNNEL_STATE" ] || return 0
  while read -r pid _; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done < "$TUNNEL_STATE"
  rm -f "$TUNNEL_STATE"
}

# Starts one quick tunnel and echoes its URL. Name is only used for the log file.
start_tunnel() { # name, local_url
  local name="$1" target="$2" log="$LOG_DIR/tunnel-$1.log" url=""
  nohup cloudflared tunnel --url "$target" --no-autoupdate \
    --protocol "$TUNNEL_PROTOCOL" --retries "$TUNNEL_RETRIES" \
    > "$log" 2>&1 &
  echo "$! $name" >> "$TUNNEL_STATE"

  for _ in $(seq 1 40); do
    url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" 2>/dev/null | head -1)"
    [ -n "$url" ] && break
    sleep 1
  done
  [ -n "$url" ] || { echo "🚨 $name tunnel did not come up — see $log" >&2; return 1; }

  # A URL appears in the log before the edge connection is registered; using it
  # too early gets Cloudflare's 1033 error page instead of the service.
  for _ in $(seq 1 40); do
    grep -q "Registered tunnel connection" "$log" && break
    sleep 1
  done
  echo "$url"
}

cmd_tunnel() {
  command -v cloudflared >/dev/null 2>&1 || {
    echo "🚨 cloudflared is not installed — brew install cloudflared" >&2; exit 1; }

  mkdir -p "$LOG_DIR"
  stop_tunnels

  local chain url
  chain="$(active_node_chain)"

  # One tunnel, because everything is behind one origin. A quick tunnel maps one
  # hostname to one port, so without this it would take three of them — and three
  # hostnames that have to agree with each other.
  echo "→ routing everything through one origin on port $DEVNET_PROXY_PORT"
  single_origin_up

  echo "→ opening the tunnel"
  url="$(start_tunnel devnet "http://localhost:$DEVNET_PROXY_PORT")" || exit 1

  # No port: a tunnel answers on 443 and the scheme carries it.
  echo "→ addressing the explorer as $url"
  apply_public_config https "${url#https://}" "" https "${url#https://}" "" wss "$url/rpc"

  echo
  echo "Public — anyone with this URL, from anywhere:"
  echo "  Explorer:  $url"
  echo "  DevNet:    $url/devnet"
  echo "  API:       $url/api/v2"
  echo "  RPC:       $url/rpc     (chain id $chain)"
  echo
  echo "  Same origin throughout, so this address works from your machine too."
  echo
  echo "⚠️  This is the public internet. The RPC is screened only while the control"
  echo "    API runs read-only — otherwise anyone with the URL can set balances and"
  echo "    overwrite code. For a shared link:"
  echo "      ./devnet.sh down${DOCKER_SUFFIX} && DEVNET_READONLY=1 ./devnet.sh up${DOCKER_SUFFIX} && ./devnet.sh tunnel${DOCKER_SUFFIX}"
  echo
  echo "  Quick tunnels get a new hostname every restart. Close it with:"
  echo "      ./devnet.sh local${DOCKER_SUFFIX}"
}

# A hostname you route yourself — a named Cloudflare tunnel, a reverse proxy, a
# VPS. Everything the browser is told is that one host over HTTPS with no port,
# which is what a tunnel or a proxy terminating TLS actually serves. Unlike
# `tunnel`, nothing is started here: the address already exists and this only
# tells the explorer about it.
#
# ── Serving it on your own domain with a named Cloudflare tunnel ─────────────
#
# Worth doing over `tunnel` for two reasons, both learned the hard way: a quick
# tunnel hands out a new hostname on every restart, so everyone testing has to
# re-add the network each time — and trycloudflare.com is blocked outright by
# some mobile carriers, which a phone reports only as a failure to fetch the
# chain id.
#
# Once, per machine:
#
#   cloudflared tunnel login                 # pick the zone in the browser
#   cloudflared tunnel create devnet         # writes <uuid>.json to ~/.cloudflared
#
# Once, per hostname:
#
#   cloudflared tunnel route dns devnet devanvil.example.com
#
# Then in ~/.cloudflared/config.yml, pointing at the single-origin front door —
# one rule serves the explorer, Blockscout's API and the RPC together, because
# devnet-proxy already splits them by path:
#
#   tunnel: <uuid>
#   credentials-file: /Users/you/.cloudflared/<uuid>.json
#   ingress:
#     - hostname: devanvil.example.com
#       service: http://localhost:8000      # DEVNET_PROXY_PORT
#     - service: http_status:404            # catch-all — must stay last
#
# One tunnel can carry several apps; add a rule per hostname, in order, since the
# first match wins. `cloudflared tunnel ingress validate` checks the file, and an
# edit needs the tunnel restarted to take effect.
#
#   cloudflared tunnel --protocol http2 run devnet
#   ./devnet.sh domain devanvil.example.com
#
# --protocol http2 for the same reason `tunnel` defaults to it: cloudflared
# prefers QUIC, and a network that blocks UDP/7844 leaves it retrying behind
# Cloudflare's error 1033 with nothing useful on screen.
#
# A stable hostname is found in ways a random URL is not, so run the control API
# read-only for anything left up — DEVNET_READONLY=1 on `up`.
cmd_domain() {
  local host="${1:-}"
  [ -n "$host" ] || { echo "🚨 Give the hostname: ./devnet.sh domain devanvil.example.com" >&2; exit 1; }
  host="${host#http://}"; host="${host#https://}"; host="${host%%/*}"

  mkdir -p "$LOG_DIR"
  stop_tunnels
  local chain
  chain="$(active_node_chain)"

  echo "→ routing everything through one origin on port $DEVNET_PROXY_PORT"
  single_origin_up

  echo "→ addressing the explorer as https://$host"
  apply_public_config https "$host" "" https "$host" "" wss "https://$host/rpc"

  echo
  echo "Served at:"
  echo "  Explorer:  https://$host"
  echo "  DevNet:    https://$host/devnet"
  echo "  API:       https://$host/api/v2"
  echo "  RPC:       https://$host/rpc     (chain id $chain)"
  echo
  echo "  Point whatever terminates TLS for $host at http://localhost:$DEVNET_PROXY_PORT."
  echo
  echo "⚠️  A stable hostname is found in a way a random tunnel URL is not, and the"
  echo "    RPC is only screened while the control API runs read-only. For anything"
  echo "    left up:"
  echo "      ./devnet.sh down${DOCKER_SUFFIX} && DEVNET_READONLY=1 ./devnet.sh up${DOCKER_SUFFIX} && ./devnet.sh domain $host"
}

# The tunnel dies far more often than the stack does — a link drops, a laptop
# sleeps, cloudflared runs out of retries — and the containers carry on serving
# perfectly the whole time. Rebuilding addressing from scratch would recreate the
# explorer for nothing, so this reopens only what actually died.
#
# What that takes depends on the kind of tunnel, which is the whole reason this
# is not one command:
#
#   named tunnel  the hostname is fixed, so reconnecting is all there is to do —
#                 nothing the explorer was told has changed
#   quick tunnel  every restart hands out a different hostname, so the explorer
#                 has to be re-addressed, which does mean recreating it
cmd_reconnect() {
  mkdir -p "$LOG_DIR"

  # Reconnecting in front of a stack that is not running would produce a public
  # address serving 502s, which is worse than saying so.
  curl -sf -m 5 -o /dev/null "http://localhost:$DEVNET_API_PORT/api/anvil/status" || {
    echo "🚨 The control API is not answering — start the stack first: ./devnet.sh up${DOCKER_SUFFIX}" >&2
    exit 1
  }

  # What the explorer is currently telling browsers is the only reliable record
  # of which mode is in effect; nothing else survives a reboot.
  local host
  host="$(curl -sf -m 5 "http://localhost:3000/assets/envs.js" 2>/dev/null \
    | sed -n 's/.*NEXT_PUBLIC_APP_HOST: "\([^"]*\)".*/\1/p' | head -1)"

  case "$host" in
    ""|localhost|127.0.0.1|[0-9]*)
      echo "🚨 Nothing public to reconnect — the explorer is addressed as ${host:-localhost}." >&2
      echo "   ./devnet.sh tunnel${DOCKER_SUFFIX} or ./devnet.sh domain <host> first." >&2
      exit 1
      ;;
    *.trycloudflare.com)
      echo "→ quick tunnel: reopening (the hostname will change)"
      cmd_tunnel
      ;;
    *)
      reconnect_named "$host"
      ;;
  esac
}

# A named tunnel keeps its hostname, so the explorer needs no changes — only the
# process has to come back. Which tunnel is named in the config, since that is
# what routes the hostname.
reconnect_named() {
  local host="$1" name
  command -v cloudflared >/dev/null 2>&1 || {
    echo "🚨 $host is served by something other than cloudflared — restart it yourself." >&2
    exit 1
  }

  name="$(sed -n 's/^tunnel:[[:space:]]*//p' "$HOME/.cloudflared/config.yml" 2>/dev/null | head -1)"
  [ -n "$name" ] || {
    echo "🚨 No tunnel named in ~/.cloudflared/config.yml — restart your tunnel yourself." >&2
    exit 1
  }

  if pgrep -f "cloudflared.*run .*$name" >/dev/null 2>&1; then
    echo "  ✓ tunnel already running — $host needs nothing"
  else
    echo "→ restarting the named tunnel"
    nohup cloudflared tunnel --protocol "$TUNNEL_PROTOCOL" --retries "$TUNNEL_RETRIES" run "$name" \
      > "$LOG_DIR/tunnel-named.log" 2>&1 &
    disown 2>/dev/null || true
    for _ in $(seq 1 30); do
      grep -q "Registered tunnel connection" "$LOG_DIR/tunnel-named.log" 2>/dev/null && break
      sleep 2
    done
    grep -q "Registered tunnel connection" "$LOG_DIR/tunnel-named.log" 2>/dev/null \
      && echo "  ✓ reconnected" \
      || { echo "  ✗ did not reconnect — see $LOG_DIR/tunnel-named.log" >&2; exit 1; }
  fi

  # The front door resolved the containers once; if any were recreated while the
  # tunnel was away, it is still dialling addresses that have gone.
  refresh_front_door

  echo
  echo "Back at https://$host — the explorer was not touched, so nothing to re-add."
}

cmd_local() {
  mkdir -p "$LOG_DIR"
  stop_tunnels
  local port
  port="$(active_node_port)"
  echo "→ addressing the explorer as http://localhost:3000"
  apply_public_config http localhost 3000 http localhost 80 ws "http://localhost:$port"
  echo "  ✓ back to localhost only"
}

case "${1:-up}" in
  up) cmd_up ;;
  down) cmd_down ;;
  reset) cmd_reset ;;
  status) cmd_status ;;
  logs) cmd_logs ;;
  expose) cmd_expose "${2:-}" ;;
  local) cmd_local ;;
  proxy) cmd_proxy ;;
  tunnel) cmd_tunnel ;;
  domain) cmd_domain "${2:-}" ;;
  reconnect) cmd_reconnect ;;
  fork) cmd_fork "${2:-}" "${3:-}" ;;
  *) sed -n '2,15p' "$0"; exit 1 ;;
esac
