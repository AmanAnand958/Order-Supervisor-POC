"""
Standalone workflow smoke test.
Run this BEFORE building the API to confirm workflow, signals, and queries work.

Usage:
    python -m scripts.test_workflow

Requirements:
- Temporal server running (docker-compose up -d)
- DB initialized (psql < backend/migrations/001_init.sql)
- Worker running (python -m app.temporal.worker)
- GROQ_API_KEY set
- DATABASE_URL set
"""

import asyncio
import json
import logging
import os
import sys
import uuid
from datetime import timedelta

# Add the backend directory to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncpg
from temporalio.client import Client

from app.temporal.workflows import OrderSupervisorWorkflow

TEMPORAL_ADDRESS = os.environ.get("TEMPORAL_ADDRESS", "localhost:7233")
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/order_supervisor")
TASK_QUEUE = os.environ.get("TEMPORAL_TASK_QUEUE", "order-supervisor")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def create_test_run(conn: asyncpg.Connection, order_id: str) -> str:
    """Create a run in the DB for the test order and return the run_id."""
    # Get first supervisor
    supervisor = await conn.fetchrow("SELECT id FROM supervisors LIMIT 1")
    if not supervisor:
        raise RuntimeError("No supervisors found in DB. Run the migration first.")

    run = await conn.fetchrow(
        """
        INSERT INTO runs (order_id, supervisor_id, status)
        VALUES ($1, $2, 'active')
        RETURNING id::text
        """,
        order_id,
        supervisor["id"],
    )
    logger.info("Created test run: %s", run["id"])
    return run["id"]


async def main() -> None:
    print("\n" + "=" * 60)
    print(" Order Supervisor — Workflow Smoke Test")
    print("=" * 60 + "\n")

    # Connect to DB
    print("1. Connecting to database...")
    conn = await asyncpg.connect(DATABASE_URL)
    print("   ✓ DB connected\n")

    order_id = f"TEST-{uuid.uuid4().hex[:8].upper()}"
    run_id = await create_test_run(conn, order_id)

    # Connect to Temporal
    print("2. Connecting to Temporal...")
    client = await Client.connect(TEMPORAL_ADDRESS)
    print("   ✓ Temporal connected\n")

    # Start the workflow
    print(f"3. Starting OrderSupervisorWorkflow for order {order_id}...")
    handle = await client.start_workflow(
        OrderSupervisorWorkflow.run,
        args=[run_id, order_id, "medium"],
        id=f"order-{order_id}",
        task_queue=TASK_QUEUE,
        execution_timeout=timedelta(hours=24),
    )
    print(f"   ✓ Workflow started: {handle.id}\n")

    # Give the first agent turn time to complete
    print("4. Waiting 10s for first agent turn (workflow_start trigger)...")
    await asyncio.sleep(10)

    # Query status
    print("5. Querying workflow state...")
    status = await handle.query(OrderSupervisorWorkflow.status)
    memory = await handle.query(OrderSupervisorWorkflow.memory_summary)
    next_wake = await handle.query(OrderSupervisorWorkflow.next_wake_at)
    paused = await handle.query(OrderSupervisorWorkflow.paused)
    timeline = await handle.query(OrderSupervisorWorkflow.timeline)

    print(f"   Status:      {status}")
    print(f"   Paused:      {paused}")
    print(f"   Next wake:   {next_wake}")
    print(f"   Memory:      {memory[:100]}..." if len(memory) > 100 else f"   Memory:      {memory}")
    print(f"   Timeline:    {len(timeline)} entries")
    print()

    # Send a signal — payment_confirmed
    print("6. Sending signal: payment_confirmed (should NOT wake with aggressiveness=medium)...")
    await handle.signal(OrderSupervisorWorkflow.order_event, {"event_type": "payment_confirmed", "payload": {"amount": 99.99, "currency": "USD"}})
    await asyncio.sleep(2)

    # Send a signal — shipment_delayed (HIGH severity, SHOULD wake)
    print("7. Sending signal: shipment_delayed (HIGH severity — SHOULD wake the agent)...")
    await handle.signal(OrderSupervisorWorkflow.order_event, {"event_type": "shipment_delayed", "payload": {"delay_hours": 48, "reason": "warehouse backlog"}})
    await asyncio.sleep(10)

    # Query again
    print("8. Querying state after signals...")
    timeline2 = await handle.query(OrderSupervisorWorkflow.timeline)
    memory2 = await handle.query(OrderSupervisorWorkflow.memory_summary)
    print(f"   Timeline:    {len(timeline2)} entries (was {len(timeline)})")
    print(f"   Memory:      {memory2[:120]}..." if len(memory2) > 120 else f"   Memory:      {memory2}")
    print()

    # Test pause / resume
    print("9. Testing interrupt / resume signals...")
    await handle.signal(OrderSupervisorWorkflow.interrupt)
    await asyncio.sleep(1)
    paused_state = await handle.query(OrderSupervisorWorkflow.paused)
    print(f"   Paused after interrupt: {paused_state}")

    await handle.signal(OrderSupervisorWorkflow.resume)
    await asyncio.sleep(1)
    paused_state = await handle.query(OrderSupervisorWorkflow.paused)
    print(f"   Paused after resume:    {paused_state}")
    print()

    # Add an instruction
    print("10. Adding mid-run instruction...")
    await handle.signal(OrderSupervisorWorkflow.add_instruction, "Please check if customer has been notified about the delay.")
    await asyncio.sleep(10)

    # Final timeline
    print("11. Final state check...")
    timeline3 = await handle.query(OrderSupervisorWorkflow.timeline)
    print(f"    Timeline entries: {len(timeline3)}")
    for entry in timeline3[-5:]:
        print(f"    [{entry.get('source','')}] {entry.get('type','')}")
    print()

    # Terminate
    print("12. Sending terminate signal (will trigger final summary)...")
    await handle.signal(OrderSupervisorWorkflow.terminate)
    print("    ✓ Terminate signal sent. Final summary will be generated.")
    print()

    await asyncio.sleep(15)

    # Check final output
    print("13. Checking final_outputs in DB...")
    final = await conn.fetchrow("SELECT * FROM final_outputs WHERE run_id = $1", run_id)
    if final:
        print(f"    Summary: {final['summary'][:200]}...")
        print(f"    Learnings: {final['learnings'][:100]}...")
    else:
        print("    (final output not yet in DB — workflow may still be wrapping up)")

    print()
    print("=" * 60)
    print(" ✓ SMOKE TEST COMPLETE")
    print("=" * 60)

    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
