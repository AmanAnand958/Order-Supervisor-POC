import asyncio
import os
import logging
import asyncpg

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("migration")

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/order_supervisor",
)


async def run_migrations():
    logger.info("Connecting to database for migration...")
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        # Resolve migration path relative to this file
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        migration_file = os.path.join(base_dir, "migrations", "001_init.sql")
        
        logger.info(f"Reading migration file: {migration_file}")
        with open(migration_file, "r") as f:
            sql = f.read()

        logger.info("Executing migration SQL...")
        # Execute migration queries
        await conn.execute(sql)
        logger.info("Migrations completed successfully.")
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        raise e
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(run_migrations())
