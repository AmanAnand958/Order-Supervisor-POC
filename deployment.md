# Deployment Guide

## Deployment Architecture

```
Vercel (free)           Railway (free/hobby)
─────────────           ────────────────────
Next.js frontend   →    API: FastAPI (backend/ root)
                        Worker: Python Worker (backend/ root)
                        Temporal: Dev Server (backend/ root)
                        PostgreSQL: Railway Database Add-on
```

To deploy this monorepo successfully, you must configure **separate Railway services** for each component instead of building from the root.

---

## Railway Configuration (Backend Setup)

### 1. Database Service
1. Click **+ New** -> **Database** -> **Add PostgreSQL**.
2. Note the database connection variables (`DATABASE_URL`).

### 2. Temporal + API Service
1. Click **+ New** -> **GitHub Repo** -> select `Order-Supervisor-POC`.
2. Go to **Settings** -> **General** -> **Root Directory** and set it to `backend`.
3. Set the **Start Command** under Settings to:
   ```bash
   bash start.sh
   ```
4. Under **Variables**, add:
   - `GROQ_API_KEY`: `<your_groq_api_key>`
   - `DATABASE_URL`: `postgresql://postgres:wUEtxUfnObKtjLLgEzANYjpNvIuZKeTA@postgres.railway.internal:5432/railway`
   - `TEMPORAL_ADDRESS`: `localhost:7233`
5. Since Temporal runs locally on the container in simple mode, we need to run both Temporal dev server and the API/worker. 
   *(Alternatively, configure a startup script `start.sh` in the root directory to run `temporal server start-dev` and `uvicorn` in parallel, or deploy them as separate Railway services).*

---

## Recommended: Monorepo Deployment via Startup Script

To run everything (Temporal Server, Temporal Worker, and FastAPI API) in a single Railway service container, we can add a `start.sh` script in the `backend/` directory:

### [NEW] `backend/start.sh`
```bash
#!/bin/bash
# Start Temporal dev server in the background
temporal server start-dev --db-filename temporal.db --ip 0.0.0.0 &

# Wait for Temporal server to boot
sleep 5

# Start Temporal Worker in the background
python -m app.temporal.worker &

# Start FastAPI API Server in the foreground
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

Make sure to set the **Root Directory** to `backend` and set the **Start Command** to `bash start.sh`.

---

## Frontend Deployment — Vercel

### 1. Go to https://vercel.com → New Project → Import your GitHub repo
### 2. Set **Root Directory** to `frontend`
### 3. Set Environment Variable:
   - `NEXT_PUBLIC_API_URL`: `https://your-railway-backend-url.up.railway.app`
### 4. Deploy!


---

## Option B — Render

### 1. Create Render account at https://render.com (free tier)

### 2. New → Blueprint → Connect your GitHub repo

### 3. Create a `render.yaml` in the root:
```yaml
services:
  - type: web
    name: order-supervisor-api
    env: docker
    dockerfilePath: ./backend/Dockerfile
    envVars:
      - key: GROQ_API_KEY
        sync: false
      - key: DATABASE_URL
        sync: false
      - key: TEMPORAL_ADDRESS
        value: localhost:7233
```

> **Note**: Render doesn't natively support docker-compose. The simpler path on Render
> is to run the API and worker as separate services, and use Render's managed Postgres.

---

## Frontend Deployment — Vercel

### 1. Go to https://vercel.com → New Project → Import your GitHub repo

### 2. Set root directory to `frontend`

### 3. Set environment variable:
```
NEXT_PUBLIC_API_URL=https://your-railway-or-render-backend.railway.app
```

### 4. Deploy → Vercel will give you a URL like `https://order-supervisor.vercel.app`

---

## Post-Deployment Verification

Run through this checklist to confirm the deployment works:

- [ ] Frontend loads at Vercel URL
- [ ] `/api/supervisors` returns the 2 seeded templates (visit `{backend_url}/api/supervisors`)
- [ ] Create a new supervisor via the UI
- [ ] Start a run (creates a Temporal workflow)
- [ ] Inject a `payment_failed` event — should wake the agent immediately
- [ ] Inject a `no_update_for_n_hours` event — should NOT wake (LOW severity)
- [ ] Timeline updates after each agent turn
- [ ] Add a mid-run instruction
- [ ] Pause / Resume works
- [ ] Terminate produces a final summary
- [ ] Final summary displays in the UI

---

## Live URLs

> **TODO**: Fill in after deployment

| Service | URL |
|---|---|
| Frontend | |
| Backend API | |
| API Docs | `{backend_url}/docs` |
| Temporal UI | (not exposed publicly — internal) |

---

## Local Dev Quick Start (without Docker)

If you don't have Docker running, you can use Temporal's local dev server:

```bash
# Install Temporal CLI
brew install temporal

# Start local Temporal dev server (uses SQLite, no Docker needed)
temporal server start-dev

# In another terminal — start the API
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# In another terminal — start the worker
cd backend
source .venv/bin/activate
python -m app.temporal.worker

# In another terminal — start the frontend
cd frontend
npm run dev
```

The Temporal dev server runs at `localhost:7233` with a UI at `localhost:8233`.
You'll still need a local Postgres instance (or update DATABASE_URL to a Supabase URL).
