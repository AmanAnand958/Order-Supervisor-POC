"""
Pydantic schemas for request/response validation.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ─────────────────────────────────────────────
# Supervisor
# ─────────────────────────────────────────────

class WakePolicy(BaseModel):
    default_interval_minutes: int = 60
    aggressiveness: str = "medium"  # low | medium | high


class ModelConfig(BaseModel):
    model: str = "mixtral-8x7b-32768"
    temperature: float = 0.3
    max_tokens: int = 1024


class SupervisorCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    base_instruction: str = Field(..., min_length=1)
    tools: list[str] = Field(default_factory=list)
    event_types: list[str] = Field(default_factory=list)
    wake_policy: WakePolicy = Field(default_factory=WakePolicy)
    model_config_: ModelConfig = Field(default_factory=ModelConfig, alias="model_config")

    class Config:
        populate_by_name = True


class SupervisorResponse(BaseModel):
    id: UUID
    name: str
    base_instruction: str
    tools: list[str]
    wake_policy: dict
    model_config_: dict = Field(..., alias="model_config")
    created_at: datetime

    class Config:
        populate_by_name = True
        from_attributes = True


# ─────────────────────────────────────────────
# Runs
# ─────────────────────────────────────────────

class RunCreate(BaseModel):
    order_id: str = Field(..., min_length=1, max_length=100)
    supervisor_id: UUID


class RunResponse(BaseModel):
    id: UUID
    order_id: str
    supervisor_id: UUID
    status: str
    next_wake_at: Optional[datetime]
    memory_summary: str
    turn_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RunDetailResponse(RunResponse):
    """Extended run response with live workflow state."""
    timeline: list[dict] = []
    extra_instructions: list[str] = []
    final_output: Optional[dict] = None
    # Live workflow state (from queries, may be None for completed runs)
    workflow_status: Optional[str] = None
    workflow_next_wake_at: Optional[str] = None
    workflow_paused: Optional[bool] = None


# ─────────────────────────────────────────────
# Events & Instructions
# ─────────────────────────────────────────────

class EventPayload(BaseModel):
    event_type: str = Field(..., min_length=1)
    payload: dict[str, Any] = Field(default_factory=dict)


class InstructionPayload(BaseModel):
    text: str = Field(..., min_length=1)


# ─────────────────────────────────────────────
# Timeline event
# ─────────────────────────────────────────────

class TimelineEventResponse(BaseModel):
    id: UUID
    run_id: UUID
    type: str
    payload: dict
    source: str
    created_at: datetime

    class Config:
        from_attributes = True
