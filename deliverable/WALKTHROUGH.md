# Walkthrough Video — Recording Guide

This document provides a step-by-step script for recording the walkthrough video. Each section maps to a required deliverable scene.

**Before recording:** Start all services (docker-compose, uvicorn, worker, npm run dev). Open the frontend at http://localhost:3000 and the Temporal UI at http://localhost:8080 in separate browser tabs.

---

## Scene 1: Creating a Supervisor Config

1. Navigate to the **Supervisors** page in the frontend
2. Show the two pre-seeded supervisor templates:
   - "Standard Order Supervisor" (medium aggressiveness)
   - "High-Priority Supervisor" (high aggressiveness)
3. Click **Create Supervisor**
4. Fill in the form:
   - Name: `VIP Order Supervisor`
   - Base instruction: `You are a VIP order supervisor. Prioritize fast resolution and proactive customer communication.`
   - Tools: check `send_customer_message`, `create_internal_note`, `escalate_issue`, `schedule_next_wakeup`
   - Aggressiveness: `high`
   - Model: `llama-3.3-70b-versatile`
5. Submit and show the new supervisor card appears in the list

## Scene 2: Starting an Order Run

1. Navigate to the **Runs** page
2. Click **Start Run**
3. Select the newly created `VIP Order Supervisor`
4. Enter an order ID: `ORD-VIP-001`
5. Submit — show the run appears in the list with status `active`
6. Click into the **Run detail page**
7. Show the initial timeline event: `workflow_start` trigger with the first agent turn executed

## Scene 3: Sending Events into the Workflow

1. On the Run detail page, use the **Inject Event** panel
2. Select event type: `payment_confirmed`
3. Enter payload JSON: `{"amount": 299.99, "currency": "USD", "method": "credit_card"}`
4. Click **Send** — show the event appears in the timeline
5. Wait a few seconds — show the agent wakes up and processes it (timeline shows agent turn)
6. Inject a second event: `shipment_created` with payload `{"carrier": "FedEx", "tracking": "FX123456789"}`
7. Show the agent processes this event as well

## Scene 4: Agent Going to Sleep and Waking Up

1. After processing events, show the **Next Wake** time in the control panel (e.g., "Wakes in 45 minutes")
2. Point out the agent is now sleeping — no new timeline entries appearing
3. Inject a LOW-severity event: `no_update_for_n_hours` with payload `{"hours": 2}`
4. Show that the timeline just logs the event but the agent does NOT wake up (because LOW severity is below the threshold)
5. Wait or use the Inject Event panel to send `payment_failed` (CRITICAL severity)
6. Show the agent immediately wakes up and processes the critical event

## Scene 5: Tool Execution

1. After the agent wakes on `payment_failed`, show the timeline
2. Point out tool calls in the timeline:
   - `send_customer_message` — agent sent an email to the customer
   - `create_internal_note` — agent created an internal note about the payment failure
   - `escalate_issue` — agent escalated with severity=critical
3. Each tool call shows the simulated result in the timeline

## Scene 6: Adding Extra Instructions

1. On the Run detail page, use the **Add Instruction** panel
2. Type: `If the customer does not respond within 24 hours, escalate to a human agent.`
3. Click **Send** — show the instruction appears in the run
4. Inject another event (e.g., `customer_message_received`)
5. Show that the agent acknowledges and incorporates the instruction into its reasoning

## Scene 7: Interrupting and Resuming a Run

1. Click the **Pause** button in the control panel
2. Show the run status changes to `paused`
3. Inject an event (e.g., `shipment_delayed`) — show it is logged but the agent does NOT process it
4. Click the **Resume** button
5. Show the agent wakes up and processes the queued event

## Scene 8: Terminating and Final Summary

1. Click the **Terminate** button
2. Confirm the termination
3. Show the run status changes to `completed` or `terminated`
4. Scroll to the **Final Summary** section at the bottom of the timeline
5. Show the structured output:
   - **Summary**: narrative of what happened during the order lifecycle
   - **Actions Taken**: list of all tool calls and decisions
   - **Learnings**: key insights from this order
   - **Recommendations**: suggestions for improving future order handling

---

## Recording Tips

- Keep the video between 3-5 minutes
- Use a screen recording tool (OBS, QuickTime, Loom)
- Narrate what you are doing at each step
- Show both the frontend dashboard and briefly the Temporal UI at http://localhost:8080 to show workflow state
- End with the final summary clearly visible on screen
