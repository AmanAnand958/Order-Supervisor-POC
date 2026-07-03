"""
Supervisors router — CRUD for supervisor configs.
"""

import json
import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request

from app.schemas import SupervisorCreate, SupervisorResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/supervisors", tags=["supervisors"])

AVAILABLE_TOOLS = [
    "send_customer_message",
    "create_internal_note",
    "escalate_issue",
    "mark_order_for_review",
    "schedule_next_wakeup",
    "close_workflow",
]


def _row_to_supervisor(row) -> dict:
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "base_instruction": row["base_instruction"],
        "tools": json.loads(row["tools"]) if isinstance(row["tools"], str) else row["tools"],
        "wake_policy": json.loads(row["wake_policy"]) if isinstance(row["wake_policy"], str) else row["wake_policy"],
        "model_config": json.loads(row["model_config"]) if isinstance(row["model_config"], str) else row["model_config"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
    }


@router.get("", response_model=list[dict])
async def list_supervisors(request: Request):
    db = request.app.state.db
    rows = await db.fetch(
        "SELECT * FROM supervisors ORDER BY created_at DESC"
    )
    return [_row_to_supervisor(r) for r in rows]


@router.get("/{supervisor_id}", response_model=dict)
async def get_supervisor(supervisor_id: UUID, request: Request):
    db = request.app.state.db
    row = await db.fetchrow(
        "SELECT * FROM supervisors WHERE id = $1", str(supervisor_id)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Supervisor not found")
    return _row_to_supervisor(row)


@router.post("", response_model=dict, status_code=201)
async def create_supervisor(body: SupervisorCreate, request: Request):
    db = request.app.state.db

    # Validate tools
    invalid = [t for t in body.tools if t not in AVAILABLE_TOOLS]
    if invalid:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown tools: {invalid}. Available: {AVAILABLE_TOOLS}",
        )

    wake_policy = body.wake_policy.model_dump()
    model_cfg = body.model_config_.model_dump()

    row = await db.fetchrow(
        """
        INSERT INTO supervisors (name, base_instruction, tools, wake_policy, model_config)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        """,
        body.name,
        body.base_instruction,
        json.dumps(body.tools),
        json.dumps(wake_policy),
        json.dumps(model_cfg),
    )
    return _row_to_supervisor(row)


@router.get("/tools/available", response_model=list[str])
async def list_available_tools():
    return AVAILABLE_TOOLS
