# apps/api/app/db.py
from pymongo import MongoClient
from .settings import settings
import certifi

if not settings.MONGO_URI or settings.MONGO_URI.strip() == "":
    raise RuntimeError(
        "MONGO_URI is missing. Put it in apps/api/.env.\n"
        "Example:\nMONGO_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
    )

client = MongoClient(settings.MONGO_URI, tlsCAFile=certifi.where())
db = client[settings.MONGO_DB]

# Collections
sessions = db["sessions"]
answers = db["answers"]
