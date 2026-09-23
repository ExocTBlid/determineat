#!/usr/bin/env bash
#
# dev-down.sh — Tear down the DeterminEat local development environment.
#
# Stops:
#   - the frontend Vite dev server started by dev-up.sh (via its recorded PID)
#   - the Docker Compose services (postgres, backend, and postgres_test if running)
#
# By default the Postgres data volume is preserved. Pass --volumes (or -v) to
# also remove it for a completely clean slate.
#
# Usage:
#   ./scripts/dev-down.sh            # stop containers, keep the database volume
#   ./scripts/dev-down.sh --volumes  # stop containers and delete the DB volume
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

FRONTEND_PID_FILE="$SCRIPT_DIR/.frontend-dev.pid"
FRONTEND_LOG="$SCRIPT_DIR/.frontend-dev.log"

REMOVE_VOLUMES=false
case "${1:-}" in
  -v|--volumes) REMOVE_VOLUMES=true ;;
  "") ;;
  *)
    echo "error: unknown argument '$1' (expected --volumes or nothing)." >&2
    exit 1
    ;;
esac

log() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }

# --- Stop the frontend dev server -------------------------------------------
if [ -f "$FRONTEND_PID_FILE" ]; then
  FRONTEND_PID="$(cat "$FRONTEND_PID_FILE")"
  if kill -0 "$FRONTEND_PID" 2>/dev/null; then
    log "Stopping frontend dev server (PGID $FRONTEND_PID)"
    # dev-up.sh launches the frontend with `setsid`, so this PID is the leader of
    # its own process group. Signal the whole group (negative PID) so vite AND its
    # esbuild child are terminated together — killing just the npm parent would
    # orphan them and leave port 5173 held.
    kill -TERM -- "-$FRONTEND_PID" 2>/dev/null || kill -TERM "$FRONTEND_PID" 2>/dev/null || true
    # Give it a moment to exit gracefully, then force-kill the group if needed.
    for _ in 1 2 3 4 5; do
      kill -0 "$FRONTEND_PID" 2>/dev/null || break
      sleep 0.5
    done
    kill -KILL -- "-$FRONTEND_PID" 2>/dev/null || kill -KILL "$FRONTEND_PID" 2>/dev/null || true
  else
    log "Frontend dev server not running (stale PID file)"
  fi
  rm -f "$FRONTEND_PID_FILE" "$FRONTEND_LOG"
else
  log "No frontend PID file found; skipping frontend shutdown"
fi

# --- Stop the containers ----------------------------------------------------
if [ "$REMOVE_VOLUMES" = true ]; then
  log "Stopping containers and removing volumes (database data will be deleted)"
  docker compose down --volumes
else
  log "Stopping containers (database volume preserved)"
  docker compose down
fi

log "Local dev environment is down."
