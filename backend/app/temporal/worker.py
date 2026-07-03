"""
Temporal worker — registers OrderSupervisorWorkflow and all activities.
Run this as a separate process from the FastAPI server.
"""

import asyncio
import logging
import os

from temporalio.client import Client
from temporalio.worker import Worker

from app.temporal.workflows import OrderSupervisorWorkflow
from app.temporal.activities import (
    run_agent_turn,
    execute_tool,
    persist_timeline_event,
    update_run_state,
    load_run_context,
    produce_final_summary,
)

logger = logging.getLogger(__name__)

TEMPORAL_ADDRESS = os.environ.get("TEMPORAL_ADDRESS", "localhost:7233")
TEMPORAL_NAMESPACE = os.environ.get("TEMPORAL_NAMESPACE", "default")
TASK_QUEUE = os.environ.get("TEMPORAL_TASK_QUEUE", "order-supervisor")


async def run_worker() -> None:
    logger.info("Connecting to Temporal at %s (namespace=%s)", TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE)
    client = await Client.connect(TEMPORAL_ADDRESS, namespace=TEMPORAL_NAMESPACE)

    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[OrderSupervisorWorkflow],
        activities=[
            run_agent_turn,
            execute_tool,
            persist_timeline_event,
            update_run_state,
            load_run_context,
            produce_final_summary,
        ],
    )

    logger.info("Worker started on task queue: %s", TASK_QUEUE)
    await worker.run()


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker())


if __name__ == "__main__":
    main()
