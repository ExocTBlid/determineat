#!/usr/bin/env bash
#
# dev-up.sh — Launch the DeterminEat local development environment.
#
# Brings up:
#   - PostgreSQL (Docker, localhost:5432) — application database
#   - backend    (Docker, localhost:3000) — Express API with live reload
#   - frontend   (Vite dev server, localhost:5173) — started on the host in the
#                background; logs stream to scripts/.frontend-dev.log and the PID
#                is recorded in scripts/.frontend-dev.pid so dev-down.sh can stop it
#
# Database migrations are applied by the backend container on startup
# (see backend/Dockerfile.dev / CMD), so this script does not run them directly.
#
# Usage:  ./scripts/dev-up.sh
# Tear down with:  ./scripts/dev-down.sh
#
set -euo pipefail

# Resolve the repo root regardless of where the script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

FRONTEND_LOG="$SCRIPT_DIR/.frontend-dev.log"
FRONTEND_PID_FILE="$SCRIPT_DIR/.frontend-dev.pid"

log() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$1" >&2; }

# --- Preflight checks -------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker is not installed or not on PATH." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "error: the Docker Compose v2 plugin is required (use 'docker compose')." >&2
  exit 1
fi

# --- Env files --------------------------------------------------------------
# Create the dev env files from the checked-in templates if they don't exist.
if [ ! -f backend/.env ] && [ -f backend/.env.example ]; then
  log "Creating backend/.env from backend/.env.example"
  cp backend/.env.example backend/.env
fi
if [ ! -f frontend/.env ] && [ -f frontend/.env.example ]; then
  log "Creating frontend/.env from frontend/.env.example"
  cp frontend/.env.example frontend/.env
fi

# --- Dependencies -----------------------------------------------------------
if [ ! -d node_modules ]; then
  log "Installing npm dependencies (node_modules missing)"
  npm install
fi

# --- Containers -------------------------------------------------------------
# Start Postgres first and wait for it to report healthy. The backend's
# depends_on requires a healthy database, so bringing them up together turns any
# Postgres startup failure into an opaque "dependency failed to start" error.
# Starting Postgres on its own lets us surface the real reason.
PG_CONTAINER="determineat-postgres-1"

log "Starting PostgreSQL"
docker compose up -d postgres

log "Waiting for PostgreSQL to become healthy"
pg_healthy=false
for i in $(seq 1 30); do
  status="$(docker inspect "$PG_CONTAINER" --format '{{.State.Health.Status}}' 2>/dev/null || echo unknown)"
  if [ "$status" = "healthy" ]; then
    pg_healthy=true
    break
  fi
  sleep 2
done

if [ "$pg_healthy" != true ]; then
  echo "error: PostgreSQL did not become healthy." >&2
  echo "--- recent postgres logs ---" >&2
  docker logs "$PG_CONTAINER" 2>&1 | tail -n 20 >&2 || true
  echo "----------------------------" >&2
  # Detect the most common local-dev cause: a data volume created by a different
  # Postgres major version than the image now pins.
  if docker logs "$PG_CONTAINER" 2>&1 | grep -q "incompatible"; then
    warn "The Postgres data volume was initialized by a different major version"
    warn "than the current image. This is stale local dev data."
    warn "Fix it by wiping the volume and starting fresh:"
    echo "      ./scripts/dev-down.sh --volumes && ./scripts/dev-up.sh" >&2
  fi
  exit 1
fi

log "Starting backend"
docker compose up -d backend

# --- Frontend dev server ----------------------------------------------------
# The Vite dev server is a long-running foreground process, so run it in the
# background on the host and track its PID for teardown.
if [ -f "$FRONTEND_PID_FILE" ] && kill -0 "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null; then
  warn "Frontend dev server already running (PID $(cat "$FRONTEND_PID_FILE")); leaving it as is."
else
  log "Starting frontend dev server (logs: $FRONTEND_LOG)"
  # Run in a new session/process group (setsid) so teardown can signal the whole
  # tree. `npm run dev` spawns vite, which spawns esbuild; killing only npm would
  # orphan those children and leave port 5173 held. The recorded PID doubles as
  # the process-group ID, which dev-down.sh kills as a group.
  setsid npm run dev --workspace @determineat/frontend >"$FRONTEND_LOG" 2>&1 &
  echo $! >"$FRONTEND_PID_FILE"
fi

log "Local dev environment is up:"
echo "    backend  API : http://localhost:3000  (health: /health)"
echo "    frontend  UI : http://localhost:5173"
echo "    postgres     : localhost:5432"
echo
echo "Frontend logs: tail -f $FRONTEND_LOG"
echo "Tear down    : ./scripts/dev-down.sh"
