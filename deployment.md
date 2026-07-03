# Deployment Guide

## Deployment Architecture

```
Vercel (free)           Railway / Render (free)
─────────────           ───────────────────────────
Next.js frontend   →    API: FastAPI (port 8000)
                        Worker: Temporal worker
                        Temporal server (port 7233)
                        PostgreSQL (port 5432)
```

All backend services run in a single docker-compose on Railway or Render.
The Next.js frontend is deployed separately on Vercel.

---

## Option A — Railway (Recommended for POC)

### 1. Create Railway account
Sign up at https://railway.app (free $5/month credit, no card needed for trial)

### 2. Create new project from GitHub
```bash
# Push the repo to GitHub first
cd /path/to/assignment
git init
git add .
git commit -m "Initial commit"
# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/order-supervisor
git push -u origin main
```

### 3. Deploy via Railway CLI
```bash
npm install -g @railway/cli
railway login
railway link   # link to your project
railway up     # deploy using docker-compose.prod.yml
```

### 4. Set environment variables in Railway dashboard:
```
GROQ_API_KEY=your_groq_key
POSTGRES_PASSWORD=your_strong_password
TEMPORAL_DB_PASSWORD=your_temporal_db_password
CORS_ORIGINS=https://your-vercel-app.vercel.app
```

### 5. Note the backend URL
Railway will give you a URL like `https://order-supervisor-production.up.railway.app`

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
