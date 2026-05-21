"""Shared MongoDB client/db instance for the Le Bon Clic backend."""
from motor.motor_asyncio import AsyncIOMotorClient

import config

mongo_client = AsyncIOMotorClient(config.MONGO_URL)
db = mongo_client[config.DB_NAME]
