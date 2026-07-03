"""
Prompt templates for the Order Supervisor agent.
"""

import json
from datetime import datetime, timezone


SYSTEM_PROMPT = """You are an Order Supervisor AI agent. You monitor a single order through its entire lifecycle.

Your role:
- Analyze the order's current state and recent events
- Decide what actions to take (tool calls)
- Maintain a compact memory summary for future turns
- Decide when to next wake up
- Determine if the order lifecycle is complete

You MUST respond with valid JSON matching this exact schema:
{{
  "reasoning": "brief explanation of your assessment",
  "tool_calls": [
    {{"tool": "tool_name", "args": {{"key": "value"}}}}
  ],
  "memory_summary": "updated compact summary of all important facts about this order",
  "next_wake_minutes": 60,
  "close_workflow": false,
  "close_reason": ""
}}

Rules:
- tool_calls can be an empty list if no action is needed
- memory_summary should be concise but complete — it replaces the previous summary
- next_wake_minutes: how many minutes until you want to be woken again (min 5, max 1440)
- close_workflow: true only when the order lifecycle is definitively complete or terminated
- close_reason: required only when close_workflow is true

Available tools:
{available_tools}

Base instructions from your supervisor config:
{base_instruction}
"""

TURN_PROMPT = """Current time: {now}

Order ID: {order_id}
Trigger: {trigger}

{extra_instructions_section}

Memory summary (from previous turns):
{memory_summary}

Recent timeline events (newest last):
{timeline}

Make your decision now. Remember: respond ONLY with valid JSON.
"""

FINAL_SUMMARY_SYSTEM = """You are producing a final summary for a completed Order Supervisor run.
Respond with valid JSON:
{
  "summary": "narrative summary of the order's lifecycle",
  "actions_taken": [
    {"action": "description", "timestamp": "...", "outcome": "..."}
  ],
  "learnings": "what was learned from handling this order",
  "recommendations": "recommendations for future similar orders"
}
"""

FINAL_SUMMARY_TURN = """Order ID: {order_id}
Final status: {final_status}

Full timeline:
{full_timeline}

Memory summary:
{memory_summary}

Produce the final summary now.
"""


def build_system_prompt(base_instruction: str, available_tools: list[str]) -> str:
    tools_str = "\n".join(f"- {t}" for t in available_tools)
    return SYSTEM_PROMPT.format(
        base_instruction=base_instruction,
        available_tools=tools_str,
    )


def build_turn_prompt(
    order_id: str,
    trigger: str,
    memory_summary: str,
    timeline_entries: list[dict],
    extra_instructions: list[str],
) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    if extra_instructions:
        extra_section = "Extra instructions from operator:\n" + "\n".join(
            f"- {i}" for i in extra_instructions
        )
    else:
        extra_section = "No extra instructions."

    if timeline_entries:
        lines = []
        for e in timeline_entries[-30:]:  # last 30 entries
            ts = e.get("created_at", "")
            if hasattr(ts, "strftime"):
                ts = ts.strftime("%Y-%m-%d %H:%M UTC")
            payload_str = json.dumps(e.get("payload", {}), ensure_ascii=False)[:200]
            lines.append(f"[{ts}] {e.get('source','?')} | {e.get('type','?')}: {payload_str}")
        timeline_str = "\n".join(lines)
    else:
        timeline_str = "(no events yet)"

    return TURN_PROMPT.format(
        now=now,
        order_id=order_id,
        trigger=trigger,
        extra_instructions_section=extra_section,
        memory_summary=memory_summary or "(no memory yet)",
        timeline=timeline_str,
    )


def build_final_summary_prompts(
    order_id: str,
    final_status: str,
    full_timeline: list[dict],
    memory_summary: str,
) -> tuple[str, str]:
    """Returns (system_prompt, user_prompt)."""
    lines = []
    for e in full_timeline:
        ts = e.get("created_at", "")
        if hasattr(ts, "strftime"):
            ts = ts.strftime("%Y-%m-%d %H:%M UTC")
        lines.append(f"[{ts}] {e.get('source','?')} | {e.get('type','?')}: {json.dumps(e.get('payload', {}))[:150]}")

    return (
        FINAL_SUMMARY_SYSTEM,
        FINAL_SUMMARY_TURN.format(
            order_id=order_id,
            final_status=final_status,
            full_timeline="\n".join(lines) or "(empty)",
            memory_summary=memory_summary or "(none)",
        ),
    )
