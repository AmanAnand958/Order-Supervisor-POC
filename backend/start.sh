#!/bin/bash
# start.sh - Single-container orchestrator for Temporal Dev Server, Worker, and FastAPI API

echo "=== Starting Temporal Dev Server ==="
# Start temporal server in background using the local binary or path
temporal server start-dev --db-filename temporal.db --ip 0.0.0.0 --ui-port 8082 > /dev/null 2>&1 &

echo "=== Waiting for Temporal Dev Server ==="
python -c '
import socket, time
for i in range(30):
    try:
        with socket.create_connection(("127.0.0.1", 7233), timeout=1):
            print("Temporal port 7233 is open.")
            break
    except OSError:
        print("Waiting for Temporal to start...")
        time.sleep(2)
else:
    print("Temporal failed to start in 60s.")
'

echo "=== Running Database Migrations ==="
python -m app.migrate

echo "=== Starting Temporal Worker ==="
python -m app.temporal.worker > worker.log 2>&1 &

echo "=== Starting FastAPI API ==="
# Bind to the PORT environment variable provided by Railway
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
