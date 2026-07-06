"""
FastAPI application entry point — Order Supervisor POC.
"""

import logging
import os

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from temporalio.client import Client

from app.database import db
from app.routers import supervisors, runs

logger = logging.getLogger(__name__)

TEMPORAL_ADDRESS = os.environ.get("TEMPORAL_ADDRESS", "localhost:7233")
TEMPORAL_NAMESPACE = os.environ.get("TEMPORAL_NAMESPACE", "default")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──
    logging.basicConfig(level=logging.INFO)
    logger.info("Connecting to database...")
    await db.connect()
    app.state.db = db
    logger.info("Database connected.")

    logger.info("Connecting to Temporal at %s...", TEMPORAL_ADDRESS)
    temporal = await Client.connect(TEMPORAL_ADDRESS, namespace=TEMPORAL_NAMESPACE)
    app.state.temporal = temporal
    logger.info("Temporal connected.")

    yield

    # ── Shutdown ──
    await db.disconnect()
    logger.info("Database disconnected.")


app = FastAPI(
    title="Order Supervisor API",
    description="Long-running AI supervisor for order lifecycle management via Temporal workflows.",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow Next.js dev server and production frontend
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://order-supervisor-poc.vercel.app",
]

env_origins = os.environ.get("CORS_ORIGINS")
if env_origins:
    for origin in env_origins.split(","):
        trimmed = origin.strip()
        if trimmed and trimmed not in CORS_ORIGINS:
            CORS_ORIGINS.append(trimmed)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(supervisors.router)
app.include_router(runs.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "order-supervisor-api"}


@app.get("/api/event-types")
async def list_event_types():
    """Return all supported order event types for the event generator UI."""
    return [
        {"type": "order_created", "description": "Order has been placed"},
        {"type": "payment_confirmed", "description": "Payment successfully processed"},
        {"type": "payment_failed", "description": "Payment failed or declined"},
        {"type": "shipment_created", "description": "Shipment label created"},
        {"type": "shipment_delayed", "description": "Shipment delayed in transit"},
        {"type": "shipment_lost", "description": "Shipment appears to be lost"},
        {"type": "out_for_delivery", "description": "Package out for delivery"},
        {"type": "delivered", "description": "Order delivered to customer"},
        {"type": "refund_requested", "description": "Customer requested a refund"},
        {"type": "refund_approved", "description": "Refund approved"},
        {"type": "refund_rejected", "description": "Refund request declined"},
        {"type": "customer_message_received", "description": "Customer sent a message"},
        {"type": "customer_complaint_filed", "description": "Customer filed a complaint"},
        {"type": "order_cancelled", "description": "Order cancelled"},
        {"type": "order_modified", "description": "Order details modified"},
        {"type": "no_update_for_n_hours", "description": "No update for N hours"},
        {"type": "fraud_flag", "description": "Potential fraud detected"},
    ]





