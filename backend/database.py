"""Shared MongoDB client/db instance for the Le Bon Clic backend."""
from motor.motor_asyncio import AsyncIOMotorClient

import config

mongo_client = AsyncIOMotorClient(
    config.MONGO_URL,
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=5000,
    socketTimeoutMS=5000,
    retryWrites=True,
)
db = mongo_client[config.DB_NAME]


async def ping_database() -> bool:
    await mongo_client.admin.command("ping")
    return True
