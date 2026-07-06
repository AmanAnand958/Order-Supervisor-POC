-- Order Supervisor POC — Initial Schema
-- Run this against your Postgres database (local or Supabase)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────
-- Supervisor configs (reusable templates)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supervisors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    base_instruction TEXT NOT NULL,
    tools           JSONB NOT NULL DEFAULT '[]',       -- list of enabled tool names
    event_types     JSONB NOT NULL DEFAULT '[]',       -- relevant event types for this supervisor
    wake_policy     JSONB NOT NULL DEFAULT '{}',       -- default_interval_minutes, aggressiveness
    model_config    JSONB NOT NULL DEFAULT '{}',       -- model, temperature, max_tokens
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure event_types column exists on supervisors table for existing deployments
ALTER TABLE supervisors ADD COLUMN IF NOT EXISTS event_types JSONB NOT NULL DEFAULT '[]';

-- ─────────────────────────────────────────────
-- Workflow runs (one per order)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        TEXT NOT NULL UNIQUE,
    supervisor_id   UUID NOT NULL REFERENCES supervisors(id),
    status          TEXT NOT NULL DEFAULT 'active',    -- active | paused | completed | terminated | error
    next_wake_at    TIMESTAMPTZ,
    memory_summary  TEXT NOT NULL DEFAULT '',
    turn_count      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS runs_supervisor_idx ON runs(supervisor_id);
CREATE INDEX IF NOT EXISTS runs_status_idx ON runs(status);

-- ─────────────────────────────────────────────
-- Timeline events (incoming events + agent actions)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timeline_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id      UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,                         -- event type or agent action name
    payload     JSONB NOT NULL DEFAULT '{}',
    source      TEXT NOT NULL DEFAULT 'system',        -- system | agent | user
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS timeline_run_idx ON timeline_events(run_id, created_at DESC);

-- ─────────────────────────────────────────────
-- Mid-run instructions added by operator
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS run_instructions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id      UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS run_instructions_run_idx ON run_instructions(run_id);

-- ─────────────────────────────────────────────
-- Final output produced when workflow closes
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS final_outputs (
    run_id          UUID PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
    summary         TEXT NOT NULL DEFAULT '',
    actions_taken   JSONB NOT NULL DEFAULT '[]',
    learnings       TEXT NOT NULL DEFAULT '',
    recommendations TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Trigger: keep runs.updated_at fresh
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS runs_updated_at ON runs;
CREATE TRIGGER runs_updated_at
    BEFORE UPDATE ON runs
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─────────────────────────────────────────────
-- Deduplicate supervisors (keep oldest of each name)
-- ─────────────────────────────────────────────
DELETE FROM supervisors
WHERE id NOT IN (
    SELECT (array_agg(id ORDER BY created_at ASC))[1] FROM supervisors GROUP BY name
);

CREATE UNIQUE INDEX IF NOT EXISTS supervisors_name_idx ON supervisors(name);

-- ─────────────────────────────────────────────
-- Seed data: 4 example supervisor templates
-- ─────────────────────────────────────────────
INSERT INTO supervisors (name, base_instruction, tools, event_types, wake_policy, model_config)
VALUES
(
    'Standard Order Supervisor',
    'You are an order supervisor AI. Your job is to monitor this order''s lifecycle and take proactive actions when needed. When payment issues occur, escalate immediately. When shipment is delayed, notify the customer and create an internal note. When the order is delivered, confirm with the customer. Be concise and professional.',
    '["send_customer_message", "create_internal_note", "escalate_issue", "mark_order_for_review", "schedule_next_wakeup", "close_workflow"]',
    '["order_created", "payment_confirmed", "payment_failed", "shipment_created", "shipment_delayed", "out_for_delivery", "delivered", "customer_message_received"]',
    '{"default_interval_minutes": 60, "aggressiveness": "medium"}',
    '{"model": "llama-3.3-70b-versatile", "temperature": 0.3, "max_tokens": 1024}'
),
(
    'High-Priority Supervisor',
    'You are a high-priority order supervisor. This order requires close attention. Wake frequently and act proactively. Any shipment delay must be escalated immediately. Payment failures require urgent customer communication. Mark any unusual patterns for review. Keep the customer informed at every step.',
    '["send_customer_message", "create_internal_note", "escalate_issue", "mark_order_for_review", "schedule_next_wakeup", "close_workflow"]',
    '["order_created", "payment_confirmed", "payment_failed", "shipment_created", "shipment_delayed", "shipment_lost", "fraud_flag", "customer_message_received"]',
    '{"default_interval_minutes": 15, "aggressiveness": "high"}',
    '{"model": "llama-3.3-70b-versatile", "temperature": 0.2, "max_tokens": 1024}'
),
(
    'Returns Supervisor',
    'You are a returns and refunds specialist. Your job is to handle return requests efficiently and fairly. When a return is requested, verify the reason, approve or deny based on policy, and communicate the decision clearly. Track return shipments and process refunds promptly. Escalate any fraudulent return patterns.',
    '["send_customer_message", "create_internal_note", "escalate_issue", "mark_order_for_review", "schedule_next_wakeup", "close_workflow"]',
    '["refund_requested", "refund_approved", "refund_rejected", "customer_complaint_filed", "customer_message_received", "order_cancelled"]',
    '{"default_interval_minutes": 30, "aggressiveness": "medium"}',
    '{"model": "llama-3.3-70b-versatile", "temperature": 0.3, "max_tokens": 1024}'
),
(
    'VIP Customer Supervisor',
    'You are a VIP customer order supervisor. This customer is high-value and expects premium service. Proactive communication is critical — update them before they have to ask. Any issue must be resolved with highest priority. Offer compensation for inconveniences. Escalate any problem immediately to management.',
    '["send_customer_message", "create_internal_note", "escalate_issue", "mark_order_for_review", "schedule_next_wakeup", "close_workflow"]',
    '["order_created", "payment_confirmed", "payment_failed", "shipment_created", "shipment_delayed", "shipment_lost", "delivered", "customer_message_received", "customer_complaint_filed", "fraud_flag"]',
    '{"default_interval_minutes": 10, "aggressiveness": "high"}',
    '{"model": "llama-3.3-70b-versatile", "temperature": 0.2, "max_tokens": 1024}'
)
ON CONFLICT (name) DO NOTHING;

-- Backfill event_types for existing supervisors that have empty event_types
UPDATE supervisors SET event_types = '["order_created", "payment_confirmed", "payment_failed", "shipment_created", "shipment_delayed", "out_for_delivery", "delivered", "customer_message_received"]' WHERE name = 'Standard Order Supervisor' AND event_types = '[]';
UPDATE supervisors SET event_types = '["order_created", "payment_confirmed", "payment_failed", "shipment_created", "shipment_delayed", "shipment_lost", "fraud_flag", "customer_message_received"]' WHERE name = 'High-Priority Supervisor' AND event_types = '[]';
UPDATE supervisors SET event_types = '["refund_requested", "refund_approved", "refund_rejected", "customer_complaint_filed", "customer_message_received", "order_cancelled"]' WHERE name = 'Returns Supervisor' AND event_types = '[]';
UPDATE supervisors SET event_types = '["order_created", "payment_confirmed", "payment_failed", "shipment_created", "shipment_delayed", "shipment_lost", "delivered", "customer_message_received", "customer_complaint_filed", "fraud_flag"]' WHERE name = 'VIP Customer Supervisor' AND event_types = '[]';
