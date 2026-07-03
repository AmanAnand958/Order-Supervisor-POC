# Order Supervisor POC

A long-running AI supervisor that oversees a single order from creation to completion, built with **Temporal workflows**, **FastAPI**, **Groq LLM**, **PostgreSQL**, and **Next.js**.

## Architecture Overview

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for a full explanation of the workflow design, sleep/wake mechanism, classifier approach, memory compaction, and tradeoffs.

## Project Structure

```
/
├── backend/                 # Python FastAPI + Temporal worker
│   ├── app/
│   │   ├── main.py          # FastAPI entry point
│   │   ├── database.py      # asyncpg connection pool
│   │   ├── schemas.py       # Pydantic request/response models
│   │   ├── routers/
│   │   │   ├── supervisors.py
│   │   │   └── runs.py
│   │   ├── temporal/
│   │   │   ├── workflows.py # OrderSupervisorWorkflow
│   │   │   ├── activities.py
│   │   │   └── worker.py
│   │   └── agent/
│   │       ├── classifier.py  # Deterministic event severity classifier
│   │       ├── llm.py         # Groq client wrapper
│   │       └── prompts.py     # Agent prompt templates
│   ├── migrations/
│   │   └── 001_init.sql
│   ├── scripts/
│   │   └── test_workflow.py   # Standalone workflow smoke test
│   ├── requirements.txt
│   ├── .env.example
│   └── Dockerfile
├── frontend/                # Next.js (App Router) + Tailwind
│   ├── app/
│   │   ├── page.tsx
│   │   ├── supervisors/page.tsx
│   │   └── runs/
│   │       ├── page.tsx
│   │       └── [id]/page.tsx
│   ├── lib/api.ts
│   └── .env.example
├── docker-compose.yml       # Local dev: Postgres + Temporal + UI
├── docker-compose.prod.yml  # Production: all services
└── temporal-config/         # Temporal dynamic config
```

## Local Development Setup

### Prerequisites

- Docker & Docker Compose
- Python 3.12+
- Node.js 20+
- A Groq API key ([free at console.groq.com](https://console.groq.com))

### Step 1 — Start Temporal + Postgres

```bash
docker-compose up -d
```

This starts:
- **PostgreSQL** (app DB) on port `5432`
- **Temporal server** on port `7233`
- **Temporal Web UI** on port `8080` → http://localhost:8080

Wait ~30 seconds for Temporal to initialize.

### Step 2 — Install Python dependencies

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### Step 3 — Configure environment

```bash
cp .env.example .env
# Edit .env and set your GROQ_API_KEY
```

The DB is auto-seeded by Docker (`001_init.sql` runs on first Postgres startup).

### Step 4 — Start the FastAPI server

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

### Step 5 — Start the Temporal worker

In a second terminal:

```bash
cd backend
source .venv/bin/activate
python -m app.temporal.worker
```

### Step 6 — (Optional) Run the workflow smoke test

Before touching the UI, verify the workflow works:

```bash
cd backend
source .venv/bin/activate
python -m scripts.test_workflow
```

This starts a workflow, sends signals, queries state, and prints the result.

### Step 7 — Start the frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Frontend: http://localhost:3000

---

## End-to-End Flow

1. Go to **Supervisors** → Create or use the seeded templates
2. Go to **Runs** → Start a run (pick a supervisor, enter an order ID)
3. The Temporal workflow starts immediately and runs the first agent turn
4. Open the **Run detail page** — the timeline updates every 3 seconds
5. Use **Inject Event** to send order lifecycle events (payment, shipment, etc.)
6. Watch the AI agent wake up (or defer) based on severity + aggressiveness
7. Add a mid-run **instruction** to change agent behavior
8. Use **Pause / Resume / Terminate** to control the workflow
9. On terminate, the agent produces a **Final Summary** with learnings

---

## Deployment

See [`deployment.md`](./deployment.md) for deployment steps and live URLs.

### Quick Prod Deploy (Railway / Render)

1. Fork / push this repo
2. Create a new Railway project → Deploy via `docker-compose.prod.yml`
3. Set env vars: `GROQ_API_KEY`, `POSTGRES_PASSWORD`
4. Deploy the frontend to Vercel → set `NEXT_PUBLIC_API_URL` to your backend URL

---

## Key Commands Reference

| Command | Description |
|---|---|
| `docker-compose up -d` | Start Temporal + Postgres locally |
| `uvicorn app.main:app --reload` | Start FastAPI (from `backend/`) |
| `python -m app.temporal.worker` | Start Temporal worker (from `backend/`) |
| `python -m scripts.test_workflow` | Run workflow smoke test |
| `npm run dev` | Start Next.js frontend (from `frontend/`) |
| `docker-compose down -v` | Tear down all local containers + data |
