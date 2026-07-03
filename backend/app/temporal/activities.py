"""
Temporal activities for Order Supervisor.

All non-deterministic work (LLM calls, DB writes, tool execution) happens here.
"""

import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import Any

import asyncpg
from temporalio import activity

from app.agent import llm, prompts

logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/order_supervisor")


# ─────────────────────────────────────────────
# Input / output dataclasses
# ─────────────────────────────────────────────

@dataclass
class AgentTurnInput:
    run_id: str
    order_id: str
    supervisor_id: str
    trigger: str
    base_instruction: str
    available_tools: list[str]
    model_config: dict
    memory_summary: str
    extra_instructions: list[str]
    recent_timeline: list[dict]


@dataclass
class AgentTurnOutput:
    reasoning: str
    tool_calls: list[dict]
    memory_summary: str
    next_wake_minutes: int
    close_workflow: bool
    close_reason: str


@dataclass
class PersistEventInput:
    run_id: str
    event_type: str
    payload: dict
    source: str  # system | agent | user


@dataclass
class UpdateRunInput:
    run_id: str
    memory_summary: str | None
    next_wake_at: str | None   # ISO8601
    status: str | None
    turn_count_delta: int


@dataclass
class FinalSummaryInput:
    run_id: str
    order_id: str
    final_status: str
    memory_summary: str


# ─────────────────────────────────────────────
# DB helpers
# ─────────────────────────────────────────────

async def _get_conn() -> asyncpg.Connection:
    return await asyncpg.connect(DATABASE_URL)


# ─────────────────────────────────────────────
# Activities
# ─────────────────────────────────────────────

@activity.defn
async def run_agent_turn(inp: AgentTurnInput) -> AgentTurnOutput:
    """
    Run a single AI agent turn. Calls Groq LLM, returns structured decision.
    This must be an activity (not workflow code) because LLM calls are non-deterministic.
    """
    system_prompt = prompts.build_system_prompt(inp.base_instruction, inp.available_tools)
    turn_prompt = prompts.build_turn_prompt(
        order_id=inp.order_id,
        trigger=inp.trigger,
        memory_summary=inp.memory_summary,
        timeline_entries=inp.recent_timeline,
        extra_instructions=inp.extra_instructions,
    )

    model_cfg = inp.model_config or {}
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": turn_prompt},
    ]

    logger.info("Agent turn: run_id=%s trigger=%s", inp.run_id, inp.trigger)

    raw = llm.chat_completion(
        messages=messages,
        model=model_cfg.get("model", "llama-3.3-70b-versatile"),
        temperature=model_cfg.get("temperature", 0.3),
        max_tokens=model_cfg.get("max_tokens", 1024),
        response_format="json_object",
    )

    return AgentTurnOutput(
        reasoning=raw.get("reasoning", ""),
        tool_calls=raw.get("tool_calls", []),
        memory_summary=raw.get("memory_summary", inp.memory_summary),
        next_wake_minutes=int(raw.get("next_wake_minutes", 60)),
        close_workflow=bool(raw.get("close_workflow", False)),
        close_reason=raw.get("close_reason", ""),
    )


@activity.defn
async def execute_tool(tool_name: str, args: dict) -> dict:
    """
    Execute a supervisor tool (mocked/simulated).
    Returns a result dict that will be appended to the timeline.
    """
    logger.info("Tool call: %s args=%s", tool_name, args)

    if tool_name == "send_customer_message":
        message = args.get("message", "")
        return {
            "status": "sent",
            "message": message,
            "channel": "email",
            "note": f"[SIMULATED] Customer email sent: {message[:100]}",
        }

    elif tool_name == "create_internal_note":
        note = args.get("note", "")
        return {
            "status": "created",
            "note": note,
            "note": f"[SIMULATED] Internal note created: {note[:100]}",
        }

    elif tool_name == "escalate_issue":
        reason = args.get("reason", "")
        severity = args.get("severity", "medium")
        return {
            "status": "escalated",
            "ticket_id": f"ESC-{int(datetime.now(timezone.utc).timestamp())}",
            "severity": severity,
            "reason": reason,
            "note": f"[SIMULATED] Issue escalated with severity={severity}",
        }

    elif tool_name == "mark_order_for_review":
        reason = args.get("reason", "")
        return {
            "status": "marked",
            "reason": reason,
            "note": f"[SIMULATED] Order marked for review: {reason[:100]}",
        }

    elif tool_name == "schedule_next_wakeup":
        wake_at = args.get("wake_at", "")
        reason = args.get("reason", "")
        return {
            "status": "scheduled",
            "wake_at": wake_at,
            "reason": reason,
            "note": f"[SIMULATED] Wakeup scheduled at {wake_at}: {reason[:80]}",
        }

    elif tool_name == "close_workflow":
        final_status = args.get("final_status", "completed")
        return {
            "status": "closing",
            "final_status": final_status,
            "note": f"[SIMULATED] Workflow closing with status={final_status}",
        }

    else:
        return {"status": "error", "note": f"Unknown tool: {tool_name}"}


@activity.defn
async def persist_timeline_event(inp: PersistEventInput) -> str:
    """Append a timeline event to Postgres. Returns the new event ID."""
    conn = await _get_conn()
    try:
        row = await conn.fetchrow(
            """
            INSERT INTO timeline_events (run_id, type, payload, source)
            VALUES ($1, $2, $3, $4)
            RETURNING id::text
            """,
            inp.run_id,
            inp.event_type,
            json.dumps(inp.payload),
            inp.source,
        )
        return row["id"]
    finally:
        await conn.close()


@activity.defn
async def update_run_state(inp: UpdateRunInput) -> None:
    """Update run memory, next wake time, status, and turn count in Postgres."""
    conn = await _get_conn()
    try:
        sets = []
        params: list[Any] = []
        i = 1

        if inp.memory_summary is not None:
            sets.append(f"memory_summary = ${i}")
            params.append(inp.memory_summary)
            i += 1
        if inp.next_wake_at is not None:
            sets.append(f"next_wake_at = ${i}")
            # Parse ISO string to datetime object for asyncpg
            from datetime import datetime
            params.append(datetime.fromisoformat(inp.next_wake_at))
            i += 1
        if inp.status is not None:
            sets.append(f"status = ${i}")
            params.append(inp.status)
            i += 1
        if inp.turn_count_delta != 0:
            sets.append(f"turn_count = turn_count + ${i}")
            params.append(inp.turn_count_delta)
            i += 1

        if not sets:
            return

        params.append(inp.run_id)
        await conn.execute(
            f"UPDATE runs SET {', '.join(sets)} WHERE id = ${i}",
            *params,
        )
    finally:
        await conn.close()


@activity.defn
async def load_run_context(run_id: str) -> dict:
    """Load run + supervisor context and recent timeline from DB."""
    conn = await _get_conn()
    try:
        run = await conn.fetchrow(
            """
            SELECT r.*, s.base_instruction, s.tools, s.wake_policy, s.model_config
            FROM runs r
            JOIN supervisors s ON s.id = r.supervisor_id
            WHERE r.id = $1
            """,
            run_id,
        )
        if not run:
            raise ValueError(f"Run {run_id} not found")

        events = await conn.fetch(
            """
            SELECT type, payload, source, created_at
            FROM timeline_events
            WHERE run_id = $1
            ORDER BY created_at DESC
            LIMIT 50
            """,
            run_id,
        )
        events_list = [
            {
                "type": e["type"],
                "payload": json.loads(e["payload"]) if isinstance(e["payload"], str) else e["payload"],
                "source": e["source"],
                "created_at": e["created_at"].isoformat() if e["created_at"] else "",
            }
            for e in reversed(events)
        ]

        instructions = await conn.fetch(
            "SELECT text FROM run_instructions WHERE run_id = $1 ORDER BY created_at",
            run_id,
        )

        return {
            "run_id": str(run["id"]),
            "order_id": run["order_id"],
            "supervisor_id": str(run["supervisor_id"]),
            "status": run["status"],
            "memory_summary": run["memory_summary"] or "",
            "turn_count": run["turn_count"],
            "base_instruction": run["base_instruction"],
            "tools": json.loads(run["tools"]) if isinstance(run["tools"], str) else run["tools"],
            "wake_policy": json.loads(run["wake_policy"]) if isinstance(run["wake_policy"], str) else run["wake_policy"],
            "model_config": json.loads(run["model_config"]) if isinstance(run["model_config"], str) else run["model_config"],
            "extra_instructions": [i["text"] for i in instructions],
            "recent_timeline": events_list,
        }
    finally:
        await conn.close()


@activity.defn
async def produce_final_summary(inp: FinalSummaryInput) -> dict:
    """Run LLM to produce a final summary and persist it in final_outputs."""
    conn = await _get_conn()
    try:
        events = await conn.fetch(
            """
            SELECT type, payload, source, created_at
            FROM timeline_events
            WHERE run_id = $1
            ORDER BY created_at
            """,
            inp.run_id,
        )
        full_timeline = [
            {
                "type": e["type"],
                "payload": json.loads(e["payload"]) if isinstance(e["payload"], str) else e["payload"],
                "source": e["source"],
                "created_at": e["created_at"].isoformat() if e["created_at"] else "",
            }
            for e in events
        ]
    finally:
        await conn.close()

    sys_prompt, turn_prompt = prompts.build_final_summary_prompts(
        order_id=inp.order_id,
        final_status=inp.final_status,
        full_timeline=full_timeline,
        memory_summary=inp.memory_summary,
    )

    raw = llm.chat_completion(
        messages=[
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": turn_prompt},
        ],
        model="llama-3.3-70b-versatile",
        temperature=0.3,
        max_tokens=2048,
        response_format="json_object",
    )

    summary = raw.get("summary", "")
    actions_taken = raw.get("actions_taken", [])
    learnings = raw.get("learnings", "")
    recommendations = raw.get("recommendations", "")

    conn = await _get_conn()
    try:
        await conn.execute(
            """
            INSERT INTO final_outputs (run_id, summary, actions_taken, learnings, recommendations)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (run_id) DO UPDATE SET
                summary = EXCLUDED.summary,
                actions_taken = EXCLUDED.actions_taken,
                learnings = EXCLUDED.learnings,
                recommendations = EXCLUDED.recommendations
            """,
            inp.run_id,
            summary,
            json.dumps(actions_taken),
            learnings,
            recommendations,
        )
    finally:
        await conn.close()

    return {
        "summary": summary,
        "actions_taken": actions_taken,
        "learnings": learnings,
        "recommendations": recommendations,
    }
