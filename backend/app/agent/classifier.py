"""
Deterministic event classifier — pure Python, no LLM calls.
Classifies incoming order events by severity so the workflow can decide
whether to wake the AI agent immediately or defer until next scheduled turn.
"""

from dataclasses import dataclass
from enum import Enum


class Severity(str, Enum):
    CRITICAL = "critical"   # Wake agent immediately
    HIGH = "high"           # Wake agent immediately
    MEDIUM = "medium"       # Wake if aggressiveness >= medium
    LOW = "low"             # Defer to next scheduled wake
    INFO = "info"           # Just log, never wake


# Map event type → severity
EVENT_SEVERITY: dict[str, Severity] = {
    # Payment events
    "payment_failed": Severity.CRITICAL,
    "payment_confirmed": Severity.HIGH,
    "refund_requested": Severity.HIGH,
    "refund_approved": Severity.MEDIUM,
    "refund_rejected": Severity.HIGH,

    # Shipment events
    "shipment_created": Severity.MEDIUM,
    "shipment_delayed": Severity.HIGH,
    "shipment_lost": Severity.CRITICAL,
    "shipment_returned": Severity.HIGH,
    "out_for_delivery": Severity.LOW,
    "delivered": Severity.HIGH,

    # Customer events
    "customer_message_received": Severity.HIGH,
    "customer_complaint_filed": Severity.CRITICAL,
    "customer_churn_risk": Severity.HIGH,

    # System / lifecycle events
    "order_created": Severity.HIGH,
    "order_cancelled": Severity.CRITICAL,
    "order_modified": Severity.MEDIUM,
    "fraud_flag": Severity.CRITICAL,
    "no_update_for_n_hours": Severity.LOW,

    # Default for unknown events
    "__default__": Severity.LOW,
}

# Terminal events — order lifecycle is complete, no more wake-ups needed
TERMINAL_EVENTS: set[str] = {
    "delivered",
    "order_cancelled",
    "order_completed",
}

# Aggressiveness levels and which severities they immediately wake on
AGGRESSIVENESS_WAKE_THRESHOLD: dict[str, set[Severity]] = {
    "high":   {Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM},
    "medium": {Severity.CRITICAL, Severity.HIGH},
    "low":    {Severity.CRITICAL},
}


@dataclass
class ClassificationResult:
    event_type: str
    severity: Severity
    should_wake: bool
    reason: str


def classify_event(event_type: str, aggressiveness: str = "medium") -> ClassificationResult:
    """
    Classify an event and decide whether the AI agent should be woken immediately.

    Args:
        event_type: The type of the incoming event (e.g. 'payment_failed').
        aggressiveness: The supervisor's configured aggressiveness level
                        ('low' | 'medium' | 'high').

    Returns:
        ClassificationResult with severity and wake decision.
    """
    severity = EVENT_SEVERITY.get(event_type, EVENT_SEVERITY["__default__"])
    wake_threshold = AGGRESSIVENESS_WAKE_THRESHOLD.get(
        aggressiveness, AGGRESSIVENESS_WAKE_THRESHOLD["medium"]
    )
    should_wake = severity in wake_threshold

    reason = (
        f"Event '{event_type}' has severity '{severity.value}'. "
        f"With aggressiveness='{aggressiveness}', wake={'YES' if should_wake else 'NO (deferred)'}."
    )

    return ClassificationResult(
        event_type=event_type,
        severity=severity,
        should_wake=should_wake,
        reason=reason,
    )


def classify_instruction(text: str) -> ClassificationResult:
    """
    Operator instructions always wake the agent immediately.
    """
    return ClassificationResult(
        event_type="add_instruction",
        severity=Severity.HIGH,
        should_wake=True,
        reason=f"Operator instruction received — always wakes the agent.",
    )
