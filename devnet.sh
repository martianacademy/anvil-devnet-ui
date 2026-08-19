#!/usr/bin/env bash
# Anvil DevNet + Blockscout — one script to run the whole stack.
#
#   ./devnet.sh up        start Blockscout (docker), the control API and the explorer UI
#   ./devnet.sh down      stop the UI, the control API and the Blockscout containers
#   ./devnet.sh reset     wipe the indexer database and reindex from a fresh chain
#   ./devnet.sh status    show what is running
#   ./devnet.sh logs      tail the control API + explorer logs
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

compose() {
  docker compose -f "$COMPOSE_DIR/anvil.yml" -f "$COMPOSE_DIR/devnet.override.yml" "$@"
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

cmd_up() {
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

  echo "→ devnet control api (port $DEVNET_API_PORT)"
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
  pkill -f "next dev -p $DEVNET_API_PORT" 2>/dev/null || true
  pkill -f "next dev -p 3000" 2>/dev/null || true
  compose down
  echo "Stopped the UI, the control API and the Blockscout containers (anvil left running)."
}

cmd_reset() {
  # Blockscout indexes by block height. When anvil restarts at block 0 the indexer
  # keeps serving the old chain's rows, so the database has to go with it.
  echo "This wipes the Blockscout index AND the devnet state for chain $DEVNET_CHAIN_ID."
  read -r -p "Continue? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }

  curl -sf -m 30 -X POST "http://localhost:$DEVNET_API_PORT/api/anvil/reset" \
    -H 'content-type: application/json' -d "{\"chainId\":$DEVNET_CHAIN_ID}" >/dev/null || true

  compose down -v
  pkill -f "anvil --host 0.0.0.0 --port $DEVNET_RPC_PORT" 2>/dev/null || true
  sleep 2
  cmd_up
}

cmd_status() {
  printf 'anvil (%s):   ' "$DEVNET_RPC_PORT"
  curl -sf -m 3 -o /dev/null -X POST "http://127.0.0.1:$DEVNET_RPC_PORT" \
    -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' && echo "up" || echo "down"
  printf 'control api:  '
  curl -sf -m 3 -o /dev/null "http://localhost:$DEVNET_API_PORT/api/anvil/status" && echo "up" || echo "down"
  printf 'blockscout:   '
  curl -sf -m 3 -o /dev/null "http://localhost/api/v2/config/backend-version" && echo "up" || echo "down"
  printf 'explorer ui:  '
  curl -sf -m 3 -o /dev/null "http://localhost:3000/" && echo "up" || echo "down"
  echo
  compose ps --format 'table {{.Name}}\t{{.Status}}' 2>/dev/null || true
}

cmd_logs() {
  tail -f "$LOG_DIR"/*.log
}

case "${1:-up}" in
  up) cmd_up ;;
  down) cmd_down ;;
  reset) cmd_reset ;;
  status) cmd_status ;;
  logs) cmd_logs ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
