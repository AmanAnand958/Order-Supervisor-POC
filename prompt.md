# Prompt: Build & Deploy "Order Supervisor" POC

Paste everything below into Antigravity as your task/project prompt.

---

## Task

Build and deploy a working POC called **Order Supervisor**: a long-running AI supervisor that oversees a single order from creation to completion using Temporal workflows. Work end-to-end: scaffold the repo, implement the backend, implement the frontend, get it running locally, then deploy it. Work in small verifiable increments — after each major piece (workflow, activities, API, UI page), run it and confirm it actually works before moving on. Don't just write code and assume it's correct.

## Required stack

- Frontend: Next.js (App Router) + Tailwind CSS
- Backend: Python + FastAPI
- Orchestration: Temporal Python SDK (`temporalio`)
- Database: PostgreSQL (use Supabase free tier or local Postgres via docker-compose for dev)
- LLM: Use **Groq API** for the agent runtime (free tier, no credit card needed)
  - Get a free API key at https://console.groq.com
  - Use model `mixtral-8x7b-32768` or `llama2-70b-4096` (both free on Groq)
  - Read the API key from environment variable `GROQ_API_KEY`
  - Use the `groq` Python package: `pip install groq`

## Core concept

One Temporal workflow runs per order, staying alive for the order's full lifecycle. Events for that order arrive as **signals**. The AI agent inside the workflow decides when to act, when to sleep, and when to wake up again. It is not a tight loop — it wakes on: (1) workflow start, (2) an incoming signal judged important enough, (3) a scheduled wake-up timer.

## 1. Temporal workflow design

Implement `OrderSupervisorWorkflow` with workflow ID `order-{order_id}`:

- **Signals**: `order_event(event)`, `add_instruction(text)`, `interrupt()`, `resume()`, `terminate()`
- **Queries**: expose live `status`, `timeline`, `memory_summary`, `next_wake_at`, `paused` for the API to poll
- **Main loop**:
  1. On start, run one agent turn immediately (trigger = `workflow_start`).
  2. Then loop: use `workflow.wait_condition` with a timeout equal to seconds-until-next-wake, waiting on new signals arriving OR the timer expiring OR terminate being called.
  3. On wake: if it was a timer, always run an agent turn (trigger = `scheduled_wakeup`). If it was a signal, first run a lightweight **deterministic classifier** (plain Python rules/severity map, NOT an LLM call) to decide if the event is important enough to wake the main agent now; if yes, run an agent turn (trigger = `signal`), if no, just append the event to the timeline and keep sleeping until the next scheduled wake or a later important event.
  4. If `paused` is true, skip agent turns until resumed, but keep accepting signals.
  5. If `terminate()` was called or the agent decides the order is complete, exit the loop and run the final summary step.
- **Agent turn logic must run as a Temporal Activity**, never inline in workflow code (LLM calls are non-deterministic). The activity receives: order context, supervisor config/base instruction, run-specific extra instructions, compact memory summary, recent timeline entries, and the trigger reason. It returns a structured decision (JSON): list of tool calls to make, updated memory summary, next wake-up time, and whether to close the workflow.
- **Tool execution** also happens as activities, called based on the agent's decision.
- Persist timeline events and memory updates to Postgres via an activity after each turn, so the API/UI don't need to talk to Temporal directly for history — only for live signals/queries/state.
- Implement `continue_as_new` when the event history grows large (e.g. every 50 turns), carrying forward the compacted memory summary and recent timeline tail.

## 2. Tools (implement at least 4, as activities, mocked/simulated — no real integrations)

- `send_customer_message(message)`
- `create_internal_note(note)`
- `escalate_issue(reason, severity)`
- `mark_order_for_review(reason)`
- `schedule_next_wakeup(wake_at, reason)`
- `close_workflow(final_status)`

## 3. Memory & timeline

- Timeline: append-only list of important events and agent actions, persisted in Postgres, queryable via API.
- Memory: a compact rolling text summary maintained by the agent — after enough timeline growth, have the agent re-summarize older history into the memory field rather than keeping raw history forever (simple compaction, not a vector store).

## 4. Event generator

Build a way to simulate order lifecycle events, either as a backend endpoint or a UI panel (or both), covering at least: `order_created`, `payment_confirmed`, `payment_failed`, `shipment_created`, `shipment_delayed`, `delivered`, `refund_requested`, `customer_message_received`, `no_update_for_n_hours`.

## 5. Backend API (FastAPI)

Implement:

- `POST /api/supervisors` — create a supervisor config (name, base_instruction, available tools, default wake-up behavior, model config, wake-aggressiveness guidance). Also seed 1-2 hardcoded example templates on startup.
- `GET /api/supervisors` / `GET /api/supervisors/{id}`
- `POST /api/runs` — creates a DB record and starts a Temporal workflow for an order
- `GET /api/runs` — list active/completed runs
- `GET /api/runs/{run_id}` — full detail: status, timeline, memory summary, next wake time, final output if completed (query the workflow for live state, fall back to DB for completed runs)
- `POST /api/runs/{run_id}/events` — send an order event as a signal
- `POST /api/runs/{run_id}/instructions` — add a run-specific instruction as a signal
- `POST /api/runs/{run_id}/interrupt`
- `POST /api/runs/{run_id}/resume`
- `POST /api/runs/{run_id}/terminate`

## 6. Database schema (Postgres)

- `supervisors(id, name, base_instruction, tools jsonb, wake_policy jsonb, model_config jsonb, created_at)`
- `runs(id, order_id, supervisor_id, status, next_wake_at, memory_summary, created_at, updated_at)`
- `timeline_events(id, run_id, type, payload jsonb, source, created_at)` — covers both raw incoming events and agent actions/tool calls
- `run_instructions(id, run_id, text, created_at)`
- `final_outputs(run_id, summary, actions_taken jsonb, learnings, recommendations, created_at)`

## 7. Frontend (Next.js + Tailwind)

Pages/panels needed (functional over polished, but usable):

- Supervisor config: list + create form (name, base instruction, tools checklist, wake-up aggressiveness, model)
- Runs list: active + completed runs with status
- Run detail page: timeline feed, memory summary panel, current status + next wake time, event injection form (dropdown of event types + payload), add-instruction form, interrupt/resume/terminate buttons, and — once complete — the final summary/learnings/recommendations
- Poll the run detail endpoint every few seconds for live updates (no need for websockets)

## 8. End-of-run output

When a workflow completes (terminal state or manual terminate), have the agent produce, as a final activity call: a summary, list of important actions taken, key learnings, and recommendations/feedback. Store in `final_outputs` and display in the UI.

## 9. Local dev setup

- `docker-compose.yml` for local Temporal server + Postgres for development
- A Temporal worker process (separate from the FastAPI process) that registers the workflow and activities
- `.env.example` files for both backend and frontend listing required vars (`GROQ_API_KEY`, `DATABASE_URL`, `TEMPORAL_ADDRESS`, etc.)
- Make sure `uvicorn` (API), the Temporal worker, and `next dev` can all be started with clear documented commands

## 10. Deployment

Deploy a working hosted version using free tiers:

- **Temporal**: self-hosted via docker-compose on the same machine as the backend (Temporal Server, not Cloud)
- **Postgres**: Supabase free tier (sign up at https://supabase.com, no credit card needed for free tier) OR self-hosted via docker-compose
- **Backend (FastAPI + worker)**: deploy on **Render.com** (free tier with persistent disk for Temporal data) or **Railway.app** (free tier) — both support docker-compose natively or can run the API and worker from the same process
- **Frontend**: deploy on Vercel (free tier), pointing at the deployed backend API URL via an env var
- **Alternative simpler approach**: if deploying a full distributed Temporal setup is complex, deploy everything (Temporal server, Postgres, API, worker, frontend) on a single **Railway** or **Render** container with docker-compose, then expose the frontend via a public URL. This is easier for a POC.
- Document exact deployment steps taken, and provide the live URLs
- Confirm end-to-end: create a supervisor, start a run, inject an event, watch it process, see the final summary

## 11. Deliverables

- Full source code in a clean monorepo structure (`/backend`, `/frontend`, `docker-compose.yml`, root README)
- `README.md` with setup instructions (local dev) and deployment instructions
- A short architecture note (can be a section in the README or a separate `ARCHITECTURE.md`) covering: workflow design, sleep/wake mechanism, classifier approach, memory compaction approach, and key tradeoffs made given the 1-2 day scope
- Confirm the deployed app is actually reachable and working end-to-end (create a supervisor, start a run, inject events, watch it sleep/wake, see tool calls happen, add an instruction mid-run, terminate a run, see a final summary) before declaring done

## Explicit non-goals (do not build these)

Real commerce/messaging integrations, authentication, multi-tenant hardening, advanced retrieval/vector memory, multiple cooperating agents, or a polished/production-grade design system. Keep everything as small and solid as possible while satisfying the above.

## Working style

- Build in this order: DB schema → Temporal workflow + activities + worker (test via a script/CLI before touching the API) → FastAPI routes → event generator → frontend pages, in that sequence.
- After the workflow is written, write a small standalone test script that starts a run, sends a couple of signals, and prints the queried state, to confirm sleep/wake/signal behavior works before building the API on top of it.
- Surface any blockers (e.g. missing Groq API key, database connection issues) immediately and ask rather than silently stubbing them out.
