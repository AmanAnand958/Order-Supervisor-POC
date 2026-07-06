# Order Supervisor POC

A long-running AI supervisor that oversees a single e-commerce order from creation to completion. An LLM agent (Llama 3.3 via Groq API) is orchestrated by a Temporal workflow, wakes up on schedule or on important events, and takes actions like sending messages, creating notes, or escalating issues. A Next.js dashboard lets operators inject events, add instructions, and monitor the agent in real-time.

**Source code:** [GitHub Repository](https://github.com/AmanAnand958/Order-Supervisor-POC)

## Tech Stack

| Layer | Technology |
|---|---|
| Orchestration | Temporal (Python SDK) |
| Backend API | Python 3.12 + FastAPI + asyncpg |
| LLM Runtime | Groq API (llama-3.3-70b-versatile) |
| Database | PostgreSQL 16 |
| Frontend | Next.js 16 + React 19 + Tailwind CSS 4 + TypeScript |
| Containerization | Docker + Docker Compose |

## Project Structure

```
/
├── backend/                 # Python FastAPI + Temporal worker
│   ├── app/
│   │   ├── main.py          # FastAPI entry point
│   │   ├── database.py      # asyncpg connection pool
│   │   ├── schemas.py       # Pydantic models
│   │   ├── routers/
│   │   │   ├── supervisors.py
│   │   │   └── runs.py
│   │   ├── temporal/
│   │   │   ├── workflows.py # OrderSupervisorWorkflow
│   │   │   ├── activities.py
│   │   │   └── worker.py
│   │   └── agent/
│   │       ├── classifier.py
│   │       ├── llm.py
│   │       └── prompts.py
│   ├── migrations/
│   │   └── 001_init.sql
│   ├── scripts/
│   │   └── test_workflow.py
│   ├── requirements.txt
│   ├── .env.example
│   └── Dockerfile
├── frontend/                # Next.js + Tailwind
│   ├── app/
│   │   ├── page.tsx
│   │   ├── supervisors/page.tsx
│   │   └── runs/
│   │       ├── page.tsx
│   │       └── [id]/page.tsx
│   ├── lib/api.ts
│   └── .env.example
├── docker-compose.yml       # Local dev: Postgres + Temporal
├── docker-compose.prod.yml  # Production: all services
└── temporal-config/
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

Starts:
- **PostgreSQL** on port `5432`
- **Temporal server** on port `7233`
- **Temporal Web UI** on port `8080`

Wait ~30 seconds for Temporal to initialize.

### Step 2 — Install Python dependencies

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Step 3 — Configure environment

```bash
cp .env.example .env
# Edit .env and set your GROQ_API_KEY
```

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

### Step 6 — (Optional) Run workflow smoke test

```bash
cd backend
source .venv/bin/activate
python -m scripts.test_workflow
```

### Step 7 — Start the frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Frontend: http://localhost:3000

## End-to-End Flow

1. Go to **Supervisors** — create or use seeded templates
2. Go to **Runs** — start a run (pick a supervisor, enter an order ID)
3. The Temporal workflow starts and runs the first agent turn
4. Open the **Run detail page** — timeline updates every 3 seconds
5. Use **Inject Event** to send order lifecycle events
6. Watch the AI agent wake up (or defer) based on severity + aggressiveness
7. Add a mid-run **instruction** to change agent behavior
8. Use **Pause / Resume / Terminate** to control the workflow
9. On terminate, the agent produces a **Final Summary** with learnings

## Key Commands

| Command | Description |
|---|---|
| `docker-compose up -d` | Start Temporal + Postgres locally |
| `uvicorn app.main:app --reload` | Start FastAPI (from `backend/`) |
| `python -m app.temporal.worker` | Start Temporal worker (from `backend/`) |
| `python -m scripts.test_workflow` | Run workflow smoke test |
| `npm run dev` | Start Next.js frontend (from `frontend/`) |
| `docker-compose down -v` | Tear down all containers + data |
