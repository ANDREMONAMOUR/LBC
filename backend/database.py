"""Shared MongoDB client/db instance for the Le Bon Clic backend."""
import certifi
from motor.motor_asyncio import AsyncIOMotorClient

import config

_mongo_options = {
    "serverSelectionTimeoutMS": 10000,
    "connectTimeoutMS": 10000,
    "socketTimeoutMS": 10000,
    "retryWrites": True,
    "tls": True,
    "tlsCAFile": certifi.where(),
}

mongo_client = AsyncIOMotorClient(config.MONGO_URL, **_mongo_options)
db = mongo_client[config.DB_NAME]


async def ping_database() -> bool:
    await mongo_client.admin.command("ping")
    return True
