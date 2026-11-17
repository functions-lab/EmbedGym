#!/usr/bin/env bash
# Start the velxio backend, then the run service.

set -euo pipefail

BACKEND_DIR=/app
SERVER=/embedgym/docker/sim_image/server.mjs
HEALTH_URL=http://127.0.0.1:8001/health

# zephyr_compiler.py resolves west off PATH.
export PATH="/opt/venv/bin:$PATH"

cd "$BACKEND_DIR"
# 0.0.0.0, not loopback: sim.sh publishes 8001 for host-side run.sh.
/opt/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8001 &
UVICORN_PID=$!

for _ in $(seq 1 120); do
  if curl -sf -m 2 "$HEALTH_URL" >/dev/null 2>&1; then
    echo "backend up on 8001"
    break
  fi
  if ! kill -0 "$UVICORN_PID" 2>/dev/null; then
    echo "error: backend exited during startup" >&2
    exit 1
  fi
  sleep 0.5
done

if ! curl -sf -m 2 "$HEALTH_URL" >/dev/null 2>&1; then
  echo "error: backend did not answer $HEALTH_URL within 60s" >&2
  kill "$UVICORN_PID" 2>/dev/null || true
  exit 1
fi

node "$SERVER" &
SERVER_PID=$!

# Either process dying takes the container down rather than leaving a half-dead
# sim answering /healthz.
wait -n "$UVICORN_PID" "$SERVER_PID"
EXIT_CODE=$?
kill "$UVICORN_PID" "$SERVER_PID" 2>/dev/null || true
exit $EXIT_CODE
