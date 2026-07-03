"""
Database connection and session management using asyncpg.
"""

import os
import asyncpg
from typing import AsyncGenerator

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/order_supervisor",
)


class Database:
    def __init__(self, url: str) -> None:
        self.url = url
        self._pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        self._pool = await asyncpg.create_pool(
            self.url,
            min_size=2,
            max_size=10,
        )

    async def disconnect(self) -> None:
        if self._pool:
            await self._pool.close()

    async def get_conn(self) -> asyncpg.Connection:
        """Acquire a connection from the pool."""
        assert self._pool is not None, "Database not connected"
        return await self._pool.acquire()

    async def release_conn(self, conn: asyncpg.Connection) -> None:
        assert self._pool is not None
        await self._pool.release(conn)

    async def execute(self, query: str, *args) -> None:
        assert self._pool is not None
        async with self._pool.acquire() as conn:
            await conn.execute(query, *args)

    async def fetchrow(self, query: str, *args):
        assert self._pool is not None
        async with self._pool.acquire() as conn:
            return await conn.fetchrow(query, *args)

    async def fetch(self, query: str, *args):
        assert self._pool is not None
        async with self._pool.acquire() as conn:
            return await conn.fetch(query, *args)

    async def fetchval(self, query: str, *args):
        assert self._pool is not None
        async with self._pool.acquire() as conn:
            return await conn.fetchval(query, *args)


db = Database(DATABASE_URL)
