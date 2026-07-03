"""
OrderSupervisorWorkflow — Temporal workflow for the Order Supervisor POC.

One workflow instance runs per order (workflow ID: order-{order_id}).
Signals drive events; the AI agent runs as an activity (non-deterministic).
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Optional

from temporalio import workflow
from temporalio.common import RetryPolicy

# Import activities (deferred import to avoid direct dependency in workflow sandbox)
with workflow.unsafe.imports_passed_through():
    from app.temporal.activities import (
        AgentTurnInput,
        AgentTurnOutput,
        FinalSummaryInput,
        PersistEventInput,
        UpdateRunInput,
        execute_tool,
        load_run_context,
        persist_timeline_event,
        produce_final_summary,
        run_agent_turn,
        update_run_state,
    )
    from app.agent.classifier import classify_event, classify_instruction

logger = logging.getLogger(__name__)

ACTIVITY_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=5),
    maximum_interval=timedelta(minutes=2),
    maximum_attempts=3,
)

CONTINUE_AS_NEW_THRESHOLD = 50  # restart history every N turns


@dataclass
class OrderEvent:
    event_type: str
    payload: dict = field(default_factory=dict)


@workflow.defn
class OrderSupervisorWorkflow:
    """
    Long-running workflow for a single order. Stays alive for the order's
    full lifecycle. Wakes on signals or scheduled timers.
    """

    def __init__(self) -> None:
        # Mutable state (safe — set during workflow execution)
        self._status: str = "initializing"
        self._paused: bool = False
        self._terminate_requested: bool = False
        self._memory_summary: str = ""
        self._next_wake_minutes: int = 60
        self._timeline: list[dict] = []
        self._pending_events: list[OrderEvent] = []
        self._pending_instructions: list[str] = []
        self._has_new_signal: bool = False
        self._turn_count: int = 0

        # Set from workflow input
        self._run_id: str = ""
        self._order_id: str = ""
        self._aggressiveness: str = "medium"

    # ─────────────────────────────────────────
    # Signals
    # ─────────────────────────────────────────

    @workflow.signal
    async def order_event(self, event: OrderEvent) -> None:
        """Receive an order lifecycle event."""
        self._pending_events.append(event)
        self._has_new_signal = True
        workflow.logger.info("Signal received: order_event type=%s", event.event_type)

    @workflow.signal
    async def add_instruction(self, text: str) -> None:
        """Operator adds a run-specific instruction."""
        self._pending_instructions.append(text)
        self._has_new_signal = True
        workflow.logger.info("Signal received: add_instruction")

    @workflow.signal
    async def interrupt(self) -> None:
        """Pause the workflow — agent turns are skipped until resumed."""
        self._paused = True
        self._status = "paused"
        self._has_new_signal = True
        workflow.logger.info("Signal received: interrupt — workflow paused")

    @workflow.signal
    async def resume(self) -> None:
        """Resume a paused workflow."""
        self._paused = False
        self._status = "active"
        self._has_new_signal = True
        workflow.logger.info("Signal received: resume — workflow active")

    @workflow.signal
    async def terminate(self) -> None:
        """Request orderly termination — will run final summary then exit."""
        self._terminate_requested = True
        self._has_new_signal = True
        workflow.logger.info("Signal received: terminate")

    # ─────────────────────────────────────────
    # Queries (synchronous, no side effects)
    # ─────────────────────────────────────────

    @workflow.query
    def status(self) -> str:
        return self._status

    @workflow.query
    def timeline(self) -> list[dict]:
        return self._timeline[-50:]  # last 50 entries

    @workflow.query
    def memory_summary(self) -> str:
        return self._memory_summary

    @workflow.query
    def next_wake_at(self) -> str:
        """ISO8601 string of next scheduled wake, or empty."""
        import datetime
        now = workflow.now()
        wake = now + datetime.timedelta(minutes=self._next_wake_minutes)
        return wake.isoformat()

    @workflow.query
    def paused(self) -> bool:
        return self._paused

    # ─────────────────────────────────────────
    # Main workflow
    # ─────────────────────────────────────────

    @workflow.run
    async def run(self, run_id: str, order_id: str, aggressiveness: str = "medium") -> dict:
        self._run_id = run_id
        self._order_id = order_id
        self._aggressiveness = aggressiveness
        self._status = "active"

        workflow.logger.info("OrderSupervisorWorkflow started: order=%s run=%s", order_id, run_id)

        # ── Turn 0: run agent immediately on workflow start ──
        await self._agent_turn(trigger="workflow_start")

        # ── Main loop ──
        while True:
            self._has_new_signal = False

            # Wait for: (a) new signal, (b) timer expiry, (c) terminate
            try:
                await workflow.wait_condition(
                    lambda: self._has_new_signal or self._terminate_requested,
                    timeout=timedelta(minutes=max(1, self._next_wake_minutes)),
                )
                timer_fired = False
            except asyncio.TimeoutError:
                timer_fired = True

            # ── Handle terminate ──
            if self._terminate_requested:
                await self._do_terminate("operator_terminate")
                break

            # ── Timer fired → always run agent ──
            if timer_fired:
                await self._flush_pending_events(wake=False)
                await self._agent_turn(trigger="scheduled_wakeup")
                continue

            # ── Signal received ──
            # First flush any pending events with classification
            important = await self._flush_pending_events(wake=True)

            # Flush pending instructions (always wake)
            if self._pending_instructions:
                if not self._paused:
                    await self._agent_turn(trigger="signal")
                self._pending_instructions.clear()
            elif important and not self._paused:
                await self._agent_turn(trigger="signal")

            # continue_as_new to keep history size bounded
            if self._turn_count >= CONTINUE_AS_NEW_THRESHOLD:
                workflow.logger.info("Continuing as new after %d turns", self._turn_count)
                workflow.continue_as_new(run_id, order_id, aggressiveness)

        return {
            "order_id": order_id,
            "run_id": run_id,
            "status": self._status,
            "memory_summary": self._memory_summary,
            "turn_count": self._turn_count,
        }

    # ─────────────────────────────────────────
    # Private helpers
    # ─────────────────────────────────────────

    async def _flush_pending_events(self, wake: bool) -> bool:
        """
        Process all pending events. Persist each to DB.
        Returns True if any event is important enough to wake the agent
        (only checked when wake=True).
        """
        has_important = False
        while self._pending_events:
            ev = self._pending_events.pop(0)
            classification = classify_event(ev.event_type, self._aggressiveness)

            # Persist to DB
            await workflow.execute_activity(
                persist_timeline_event,
                PersistEventInput(
                    run_id=self._run_id,
                    event_type=ev.event_type,
                    payload=ev.payload,
                    source="user",
                ),
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=ACTIVITY_RETRY,
            )

            # Track in in-memory timeline
            self._timeline.append({
                "type": ev.event_type,
                "payload": ev.payload,
                "source": "user",
                "severity": classification.severity.value,
            })

            if wake and classification.should_wake:
                has_important = True

        return has_important

    async def _agent_turn(self, trigger: str) -> None:
        """Run one agent turn (via activity). Handle its output."""
        if self._paused:
            workflow.logger.info("Skipping agent turn (paused), trigger=%s", trigger)
            return

        self._turn_count += 1

        # Load fresh context from DB (to get latest timeline + instructions)
        ctx = await workflow.execute_activity(
            load_run_context,
            self._run_id,
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=ACTIVITY_RETRY,
        )

        inp = AgentTurnInput(
            run_id=self._run_id,
            order_id=self._order_id,
            supervisor_id=ctx["supervisor_id"],
            trigger=trigger,
            base_instruction=ctx["base_instruction"],
            available_tools=ctx["tools"],
            model_config=ctx["model_config"],
            memory_summary=self._memory_summary or ctx["memory_summary"],
            extra_instructions=self._pending_instructions + ctx["extra_instructions"],
            recent_timeline=ctx["recent_timeline"],
        )
        self._pending_instructions.clear()

        # Run the LLM agent turn
        result: AgentTurnOutput = await workflow.execute_activity(
            run_agent_turn,
            inp,
            start_to_close_timeout=timedelta(minutes=3),
            retry_policy=ACTIVITY_RETRY,
        )

        self._memory_summary = result.memory_summary
        self._next_wake_minutes = max(1, result.next_wake_minutes)

        # Persist agent turn event
        await workflow.execute_activity(
            persist_timeline_event,
            PersistEventInput(
                run_id=self._run_id,
                event_type="agent_turn",
                payload={
                    "trigger": trigger,
                    "reasoning": result.reasoning,
                    "tool_calls": result.tool_calls,
                    "next_wake_minutes": result.next_wake_minutes,
                    "close_workflow": result.close_workflow,
                },
                source="agent",
            ),
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=ACTIVITY_RETRY,
        )

        # Execute tool calls (each as its own activity)
        for tc in result.tool_calls:
            tool_name = tc.get("tool", "")
            tool_args = tc.get("args", {})
            if not tool_name:
                continue

            tool_result = await workflow.execute_activity(
                execute_tool,
                args=[tool_name, tool_args],
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=ACTIVITY_RETRY,
            )

            await workflow.execute_activity(
                persist_timeline_event,
                PersistEventInput(
                    run_id=self._run_id,
                    event_type=f"tool:{tool_name}",
                    payload={"args": tool_args, "result": tool_result},
                    source="agent",
                ),
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=ACTIVITY_RETRY,
            )

        # Update run state in DB
        import datetime as dt
        next_wake = (workflow.now() + dt.timedelta(minutes=self._next_wake_minutes)).isoformat()
        await workflow.execute_activity(
            update_run_state,
            UpdateRunInput(
                run_id=self._run_id,
                memory_summary=self._memory_summary,
                next_wake_at=next_wake,
                status=None,  # keep current
                turn_count_delta=1,
            ),
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=ACTIVITY_RETRY,
        )

        # Handle close workflow signal from agent
        if result.close_workflow:
            await self._do_terminate(result.close_reason or "agent_decision")

    async def _do_terminate(self, reason: str) -> None:
        """Run final summary activity and mark run as completed."""
        self._status = "completed" if reason != "operator_terminate" else "terminated"

        await workflow.execute_activity(
            update_run_state,
            UpdateRunInput(
                run_id=self._run_id,
                memory_summary=None,
                next_wake_at=None,
                status=self._status,
                turn_count_delta=0,
            ),
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=ACTIVITY_RETRY,
        )

        # Produce and persist final summary
        await workflow.execute_activity(
            produce_final_summary,
            FinalSummaryInput(
                run_id=self._run_id,
                order_id=self._order_id,
                final_status=self._status,
                memory_summary=self._memory_summary,
            ),
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=ACTIVITY_RETRY,
        )

        self._terminate_requested = True  # ensure main loop exits
