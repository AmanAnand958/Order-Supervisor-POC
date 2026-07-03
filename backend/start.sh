#!/bin/bash
# start.sh - Single-container orchestrator for Temporal Dev Server, Worker, and FastAPI API

echo "=== Starting Temporal Dev Server ==="
# Start temporal server in background using the local binary or path
temporal server start-dev --db-filename temporal.db --ip 0.0.0.0 --ui-port 8082 > /dev/null 2>&1 &

echo "=== Waiting for Temporal Dev Server ==="
sleep 5

echo "=== Running Database Migrations ==="
python -m app.migrate

echo "=== Starting Temporal Worker ==="
python -m app.temporal.worker > /dev/null 2>&1 &

echo "=== Starting FastAPI API ==="
# Bind to the PORT environment variable provided by Railway
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
