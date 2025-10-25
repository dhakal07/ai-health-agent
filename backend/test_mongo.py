from urllib.parse import urlsplit
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from app.core.config import settings

def redact(uri: str) -> str:
    p = urlsplit(uri)
    if "@" in p.netloc and ":" in p.netloc.split("@")[0]:
        user_host = p.netloc.split("@")
        user = user_host[0].split(":")[0]
        return uri.replace(user_host[0], f"{user}:***")
    return uri

print("MONGO_URI =", redact(settings.MONGO_URI))
try:
    client = MongoClient(settings.MONGO_URI, serverSelectionTimeoutMS=3000, connectTimeoutMS=3000)
    print("Ping:", client.admin.command("ping"))
    print("OK: Connected to Mongo.")
except Exception as e:
    print("ERROR:", repr(e))
