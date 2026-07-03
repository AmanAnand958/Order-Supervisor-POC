"""
Runs router — manage workflow runs.
"""

import json
import logging
from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from temporalio.client import Client, WorkflowFailureError
from temporalio.exceptions import WorkflowAlreadyStartedError
from temporalio.service import RPCError

from app.schemas import EventPayload, InstructionPayload, RunCreate
from app.temporal.workflows import OrderSupervisorWorkflow

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/runs", tags=["runs"])

TASK_QUEUE = "order-supervisor"


def _row_to_run(row) -> dict:
    return {
        "id": str(row["id"]),
        "order_id": row["order_id"],
        "supervisor_id": str(row["supervisor_id"]),
        "status": row["status"],
        "next_wake_at": row["next_wake_at"].isoformat() if row["next_wake_at"] else None,
        "memory_summary": row["memory_summary"] or "",
        "turn_count": row["turn_count"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
    }


async def _get_workflow_handle(client: Client, order_id: str):
    """Return a handle to the running workflow or None if not found."""
    try:
        return client.get_workflow_handle(f"order-{order_id}")
    except Exception:
        return None


@router.get("", response_model=list[dict])
async def list_runs(request: Request, status: str | None = None):
    db = request.app.state.db
    if status:
        rows = await db.fetch(
            "SELECT * FROM runs WHERE status = $1 ORDER BY created_at DESC", status
        )
    else:
        rows = await db.fetch("SELECT * FROM runs ORDER BY created_at DESC")
    return [_row_to_run(r) for r in rows]


@router.post("", response_model=dict, status_code=201)
async def create_run(body: RunCreate, request: Request):
    db = request.app.state.db
    temporal: Client = request.app.state.temporal

    # Validate supervisor exists
    supervisor = await db.fetchrow(
        "SELECT * FROM supervisors WHERE id = $1", str(body.supervisor_id)
    )
    if not supervisor:
        raise HTTPException(status_code=404, detail="Supervisor not found")

    # Check for existing run with same order_id
    existing = await db.fetchrow(
        "SELECT id FROM runs WHERE order_id = $1", body.order_id
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"A run already exists for order_id={body.order_id}",
        )

    wake_policy = json.loads(supervisor["wake_policy"]) if isinstance(supervisor["wake_policy"], str) else supervisor["wake_policy"]
    aggressiveness = wake_policy.get("aggressiveness", "medium")

    # Create DB record
    row = await db.fetchrow(
        """
        INSERT INTO runs (order_id, supervisor_id, status)
        VALUES ($1, $2, 'active')
        RETURNING *
        """,
        body.order_id,
        str(body.supervisor_id),
    )
    run_id = str(row["id"])

    # Start Temporal workflow
    try:
        await temporal.start_workflow(
            OrderSupervisorWorkflow.run,
            args=[run_id, body.order_id, aggressiveness],
            id=f"order-{body.order_id}",
            task_queue=TASK_QUEUE,
            execution_timeout=timedelta(days=30),
        )
    except WorkflowAlreadyStartedError:
        # Idempotent: workflow already running for this order
        logger.warning("Workflow already started for order %s", body.order_id)
    except Exception as exc:
        # Roll back DB record
        await db.execute("DELETE FROM runs WHERE id = $1", run_id)
        logger.error("Failed to start workflow: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to start workflow: {exc}")

    return _row_to_run(row)


@router.get("/{run_id}", response_model=dict)
async def get_run(run_id: UUID, request: Request):
    db = request.app.state.db
    temporal: Client = request.app.state.temporal

    row = await db.fetchrow("SELECT * FROM runs WHERE id = $1", str(run_id))
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")

    result = _row_to_run(row)

    # Fetch timeline from DB
    events = await db.fetch(
        """
        SELECT id, type, payload, source, created_at
        FROM timeline_events
        WHERE run_id = $1
        ORDER BY created_at DESC
        LIMIT 100
        """,
        str(run_id),
    )
    result["timeline"] = [
        {
            "id": str(e["id"]),
            "type": e["type"],
            "payload": json.loads(e["payload"]) if isinstance(e["payload"], str) else e["payload"],
            "source": e["source"],
            "created_at": e["created_at"].isoformat() if e["created_at"] else None,
        }
        for e in reversed(events)
    ]

    # Fetch instructions
    instructions = await db.fetch(
        "SELECT text FROM run_instructions WHERE run_id = $1 ORDER BY created_at",
        str(run_id),
    )
    result["extra_instructions"] = [i["text"] for i in instructions]

    # Fetch final output if completed
    final = await db.fetchrow(
        "SELECT * FROM final_outputs WHERE run_id = $1", str(run_id)
    )
    if final:
        result["final_output"] = {
            "summary": final["summary"],
            "actions_taken": json.loads(final["actions_taken"]) if isinstance(final["actions_taken"], str) else final["actions_taken"],
            "learnings": final["learnings"],
            "recommendations": final["recommendations"],
            "created_at": final["created_at"].isoformat() if final["created_at"] else None,
        }

    # Query live workflow state (if still running)
    if row["status"] in ("active", "paused"):
        try:
            handle = temporal.get_workflow_handle(f"order-{row['order_id']}")
            result["workflow_status"] = await handle.query(OrderSupervisorWorkflow.status)
            result["workflow_next_wake_at"] = await handle.query(OrderSupervisorWorkflow.next_wake_at)
            result["workflow_paused"] = await handle.query(OrderSupervisorWorkflow.paused)
        except Exception as exc:
            logger.warning("Could not query workflow for run %s: %s", run_id, exc)
            result["workflow_status"] = row["status"]
            result["workflow_paused"] = row["status"] == "paused"

    return result


@router.post("/{run_id}/events", status_code=202)
async def send_event(run_id: UUID, body: EventPayload, request: Request):
    db = request.app.state.db
    temporal: Client = request.app.state.temporal

    row = await db.fetchrow("SELECT order_id, status FROM runs WHERE id = $1", str(run_id))
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")
    if row["status"] in ("completed", "terminated", "error"):
        raise HTTPException(status_code=409, detail=f"Run is already {row['status']}")

    handle = temporal.get_workflow_handle(f"order-{row['order_id']}")
    try:
        await handle.signal(
            OrderSupervisorWorkflow.order_event,
            {"event_type": body.event_type, "payload": body.payload},
        )
    except RPCError as exc:
        raise HTTPException(status_code=500, detail=f"Signal failed: {exc}")

    return {"status": "accepted", "event_type": body.event_type}


@router.post("/{run_id}/instructions", status_code=202)
async def add_instruction(run_id: UUID, body: InstructionPayload, request: Request):
    db = request.app.state.db
    temporal: Client = request.app.state.temporal

    row = await db.fetchrow("SELECT order_id, status FROM runs WHERE id = $1", str(run_id))
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")
    if row["status"] in ("completed", "terminated", "error"):
        raise HTTPException(status_code=409, detail=f"Run is already {row['status']}")

    # Persist to DB
    await db.execute(
        "INSERT INTO run_instructions (run_id, text) VALUES ($1, $2)",
        str(run_id),
        body.text,
    )

    # Signal workflow
    handle = temporal.get_workflow_handle(f"order-{row['order_id']}")
    try:
        await handle.signal(OrderSupervisorWorkflow.add_instruction, body.text)
    except RPCError as exc:
        raise HTTPException(status_code=500, detail=f"Signal failed: {exc}")

    return {"status": "accepted", "text": body.text}


@router.post("/{run_id}/interrupt", status_code=202)
async def interrupt_run(run_id: UUID, request: Request):
    db = request.app.state.db
    temporal: Client = request.app.state.temporal

    row = await db.fetchrow("SELECT order_id FROM runs WHERE id = $1", str(run_id))
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")

    await db.execute("UPDATE runs SET status = 'paused' WHERE id = $1", str(run_id))
    handle = temporal.get_workflow_handle(f"order-{row['order_id']}")
    await handle.signal(OrderSupervisorWorkflow.interrupt)
    return {"status": "accepted"}


@router.post("/{run_id}/resume", status_code=202)
async def resume_run(run_id: UUID, request: Request):
    db = request.app.state.db
    temporal: Client = request.app.state.temporal

    row = await db.fetchrow("SELECT order_id FROM runs WHERE id = $1", str(run_id))
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")

    await db.execute("UPDATE runs SET status = 'active' WHERE id = $1", str(run_id))
    handle = temporal.get_workflow_handle(f"order-{row['order_id']}")
    await handle.signal(OrderSupervisorWorkflow.resume)
    return {"status": "accepted"}


@router.post("/{run_id}/terminate", status_code=202)
async def terminate_run(run_id: UUID, request: Request):
    db = request.app.state.db
    temporal: Client = request.app.state.temporal

    row = await db.fetchrow("SELECT order_id FROM runs WHERE id = $1", str(run_id))
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")

    handle = temporal.get_workflow_handle(f"order-{row['order_id']}")
    await handle.signal(OrderSupervisorWorkflow.terminate)
    return {"status": "accepted"}
