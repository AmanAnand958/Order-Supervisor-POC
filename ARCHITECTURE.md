# Architecture — Order Supervisor POC

## 1. Workflow Design

One `OrderSupervisorWorkflow` Temporal workflow runs per order. Its workflow ID is `order-{order_id}`, so it is addressable and idempotent.

```
OrderSupervisorWorkflow (workflow ID: order-ORD-12345)
│
├── Signals:  order_event | add_instruction | interrupt | resume | terminate
├── Queries:  status | timeline | memory_summary | next_wake_at | paused
│
└── Main loop:
    1. [Start] run agent turn immediately (trigger=workflow_start)
    2. wait_condition(lambda: new_signal OR terminate, timeout=next_wake_minutes)
       ┌── Timer fired → agent turn (trigger=scheduled_wakeup)
       ├── Signal: event → classify → if important → agent turn (trigger=signal)
       ├── Signal: instruction → agent turn (trigger=signal)
       ├── Signal: interrupt → set paused=True, skip turns
       ├── Signal: resume → set paused=False
       └── Signal: terminate → _do_terminate() → exit loop
    3. continue_as_new every 50 turns (carry forward memory + timeline tail)
```

The workflow **never calls the LLM directly**. All non-deterministic work (LLM calls, DB writes, tool execution) is delegated to **Temporal Activities**, which have retry logic and can be run on any worker.

## 2. Sleep / Wake Mechanism

The workflow uses `workflow.wait_condition()` with a timeout equal to `next_wake_minutes` (returned by the agent on each turn, min 1 min, max 1440 min).

- **On timer expiry**: always run an agent turn (`scheduled_wakeup`)
- **On signal arrival**: first run the deterministic classifier. Only wake the agent if the signal exceeds the configured aggressiveness threshold.

This means:
- A `payment_failed` event (CRITICAL severity) **always** wakes the agent immediately.
- A `no_update_for_n_hours` event (LOW severity) is just logged and the agent sleeps on.
- The agent itself sets the next wakeup time in its response, so it can schedule a check in 5 minutes or 24 hours depending on context.

## 3. Deterministic Classifier Approach

The classifier (`app/agent/classifier.py`) is **pure Python with no LLM calls**. It maps event types to severity levels:

```
CRITICAL  → payment_failed, shipment_lost, order_cancelled, fraud_flag, customer_complaint_filed
HIGH      → payment_confirmed, shipment_delayed, delivered, refund_requested, customer_message_received
MEDIUM    → shipment_created, order_modified, refund_approved
LOW       → out_for_delivery, no_update_for_n_hours
```

Three aggressiveness levels control the wake threshold:

| Aggressiveness | Wakes on |
|---|---|
| `high` | CRITICAL + HIGH + MEDIUM |
| `medium` | CRITICAL + HIGH |
| `low` | CRITICAL only |

This avoids burning LLM tokens on every incoming event while ensuring truly important events (payment failures, delivery, complaints) always trigger immediate action.

## 4. Memory Compaction Approach

The agent maintains a **rolling text summary** (not a vector store). On each agent turn:

1. The prompt includes the last 30 timeline events and the current `memory_summary`.
2. The agent returns an updated `memory_summary` as part of its JSON response.
3. This summary replaces the previous one in the workflow's in-memory state and is persisted to the DB.

For very long-running orders:
- The workflow uses `continue_as_new` every 50 turns to reset Temporal's event history.
- When doing so, it carries forward the `memory_summary` and the last few timeline entries.
- The DB retains the full timeline forever for display purposes.

This keeps the context window manageable without needing a vector store or RAG pipeline.

## 5. Activity Architecture

All side-effecting work runs as Temporal Activities:

| Activity | Purpose |
|---|---|
| `run_agent_turn` | Calls Groq LLM, returns structured JSON decision |
| `execute_tool` | Dispatches to mocked tool implementations |
| `persist_timeline_event` | Appends an event to `timeline_events` in Postgres |
| `update_run_state` | Updates `runs.memory_summary`, `next_wake_at`, `status`, `turn_count` |
| `load_run_context` | Reads run + supervisor config + recent timeline from DB |
| `produce_final_summary` | Calls Groq for final summary, persists to `final_outputs` |

Each activity has a retry policy (3 retries, exponential backoff) to handle transient failures.

## 6. Database Role

The API and frontend **do not query Temporal directly** for history. Instead:

- The worker persists every timeline event to Postgres after each turn.
- The API serves timeline data from Postgres.
- **Live state** (current status, next wake, paused flag, memory summary) is queried from the running workflow via Temporal queries — with a fallback to DB for completed runs.

This means the UI works correctly for both live and completed runs.

## 7. Key Tradeoffs (given 1-2 day scope)

| Tradeoff | Decision |
|---|---|
| LLM calls in activities | Correct Temporal pattern; adds latency but ensures determinism |
| asyncpg (not SQLAlchemy ORM) | Lower overhead, simpler for this use case |
| Single docker-compose for prod | Simpler to deploy on Railway/Render vs. full distributed setup |
| Groq free tier | No cost, fast inference; limited to mixtral/llama |
| Mocked tools | No real integrations; focus on orchestration correctness |
| No auth | Single-tenant POC scope; not production-hardened |
| Polling (no WebSockets) | Frontend polls every 3s; sufficient for this demo |
| Single Temporal namespace | Default namespace; no multi-tenancy needed for POC |
