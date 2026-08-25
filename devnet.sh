#!/usr/bin/env bash
# Anvil DevNet + Blockscout — one script to run the whole stack.
#
#   ./devnet.sh up          start Blockscout (docker), the control API and the explorer UI
#   ./devnet.sh down        stop the UI, the control API and the Blockscout containers
#   ./devnet.sh reset       wipe the indexer database and reindex from a fresh chain
#   ./devnet.sh status      show what is running
#   ./devnet.sh logs        tail the control API + explorer logs
#   ./devnet.sh expose [ip] serve the UI and RPC to your local network
#   ./devnet.sh local       point everything back at localhost
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

export DEVNET_RPC_PORT="${DEVNET_RPC_PORT:-8546}"
export DEVNET_CHAIN_ID="${DEVNET_CHAIN_ID:-31337}"
export DEVNET_API_PORT="${DEVNET_API_PORT:-3010}"
# Blockscout indexes from here; a fork must set it or the catchup indexer walks
# every block from genesis.
export DEVNET_FIRST_BLOCK="${DEVNET_FIRST_BLOCK:-0}"

# --docker anywhere in the arguments runs everything in containers.
DOCKER_MODE=0
ARGS=()
for arg in "$@"; do
  if [ "$arg" = "--docker" ]; then DOCKER_MODE=1; else ARGS+=("$arg"); fi
done
set -- "${ARGS[@]+"${ARGS[@]}"}"

# Both are read by stack/docker-compose/devnet-stack.yml.
export DEVNET_COMPOSE_DIR="$COMPOSE_DIR"
export DEVNET_REPO_DIR="$CONTROL_DIR"

# The containerised control API cannot see this machine's LAN address, so hand it over.
DEVNET_HOST_IP="${DEVNET_HOST_IP:-}"
export DEVNET_HOST_IP

compose() {
  local files=(-f "$COMPOSE_DIR/anvil.yml" -f "$COMPOSE_DIR/devnet.override.yml")
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
  nohup anvil --host 0.0.0.0 --port "$DEVNET_RPC_PORT" --chain-id "$DEVNET_CHAIN_ID" \
        --block-time 2 --steps-tracing > "$LOG_DIR/anvil.log" 2>&1 &
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

  local ip
  ip="$(detect_lan_ip)"
  if [ -n "$ip" ]; then
    echo
    printf '  %-13s %-28s %s\n' "" "On this machine" "On your network"
    printf '  %-13s %-28s %s\n' "Explorer" "http://localhost:3000" "http://$ip:3000"
    printf '  %-13s %-28s %s\n' "RPC" "http://127.0.0.1:$node_port" "http://$ip:$node_port"
    printf '  %-13s %-28s %s\n' "Explorer API" "http://localhost/api/v2" "http://$ip/api/v2"
    echo
    echo "  The network column needs ./devnet.sh expose — the explorer bakes its URLs in."
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

# The explorer bakes NEXT_PUBLIC_* values into the bundle, so a visitor's browser
# uses whatever host is written here — "localhost" would resolve to their machine.
set_public_host() {
  local host="$1"
  local env_file="$FRONTEND_DIR/.env.local"

  [ -f "$env_file" ] || { echo "🚨 $env_file not found — run ./stack/setup.sh first." >&2; exit 1; }

  local tmp
  tmp="$(mktemp)"
  sed -E \
    -e "s|^NEXT_PUBLIC_APP_HOST=.*|NEXT_PUBLIC_APP_HOST=${host}|" \
    -e "s|^NEXT_PUBLIC_API_HOST=.*|NEXT_PUBLIC_API_HOST=${host}|" \
    -e "s|^NEXT_PUBLIC_STATS_API_HOST=.*|NEXT_PUBLIC_STATS_API_HOST=http://${host}:8080|" \
    -e "s|^NEXT_PUBLIC_VISUALIZE_API_HOST=.*|NEXT_PUBLIC_VISUALIZE_API_HOST=http://${host}:8081|" \
    -e "s|^NEXT_PUBLIC_NETWORK_RPC_URL=.*|NEXT_PUBLIC_NETWORK_RPC_URL=http://${host}:${DEVNET_RPC_PORT}|" \
    "$env_file" > "$tmp"
  mv "$tmp" "$env_file"
}

restart_frontend() {
  pkill -f "next dev -p 3000" 2>/dev/null || true
  sleep 1
  ( cd "$FRONTEND_DIR" && pnpm dev:local > "$LOG_DIR/frontend.log" 2>&1 & )
  wait_for "http://localhost:3000/" "explorer ui" 80
}

# The containerised UI has no .env.local — its public URLs come from compose, so
# exposing it means recreating that one container with a different host.
expose_docker() {
  local host="$1"
  export DEVNET_PUBLIC_HOST="$host"
  export DEVNET_HOST_IP="$host"
  compose up -d --force-recreate --no-deps --pull never devnet-ui
  wait_for "http://localhost:3000/" "explorer ui" 60
}

cmd_expose() {
  local host="${1:-$(detect_lan_ip)}"
  [ -n "$host" ] || { echo "🚨 Could not detect a LAN address — pass one: ./devnet.sh expose 192.168.1.42" >&2; exit 1; }

  # What the explorer tells a visitor to point their wallet at has to be the port
  # the node is on, not the one we would have started it on.
  local node_port node_chain
  node_port="$(active_node_port)"
  node_chain="$(active_node_chain)"
  export DEVNET_RPC_PORT="$node_port"
  export DEVNET_CHAIN_ID="$node_chain"

  mkdir -p "$LOG_DIR"
  echo "→ rebuilding the explorer for http://$host:3000"
  if [ "$DOCKER_MODE" = "1" ]; then
    expose_docker "$host"
  else
    set_public_host "$host"
    restart_frontend
  fi

  echo
  echo "Use this address yourself too — while exposed, http://localhost:3000 breaks:"
  echo "  the app calls its own API on $host, and the browser blocks that as cross-origin."
  echo
  echo "Share these on your network:"
  echo "  Explorer:  http://$host:3000"
  echo "  RPC:       http://$host:$node_port     (chain id $node_chain)"
  echo "  API:       http://$host/api/v2"
  echo
  echo "⚠️  Anyone who can reach these can also patch balances, write storage and"
  echo "    stop your node — the control API has no authentication."
  echo "    For a shared network, restart it read-only:"
  echo "      ./devnet.sh down && DEVNET_READONLY=1 ./devnet.sh up && ./devnet.sh expose $host"
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

cmd_local() {
  mkdir -p "$LOG_DIR"
  echo "→ rebuilding the explorer for http://localhost:3000"
  if [ "$DOCKER_MODE" = "1" ]; then
    expose_docker localhost
  else
    set_public_host localhost
    restart_frontend
  fi
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
  fork) cmd_fork "${2:-}" "${3:-}" ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
