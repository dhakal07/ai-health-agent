# backend/app/db/mongodb.py
from typing import Any, Dict, List, Optional
from datetime import datetime
from pymongo import MongoClient
import certifi
from app.core.config import settings

DB_MODE = "mongo"  # becomes "memory" if we fall back

# --- minimal in-memory collections (PyMongo-like API) ---
class _InsertOneResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id

class _UpdateResult:
    def __init__(self, matched_count: int):
        self.matched_count = matched_count

class _MemoryCollection:
    def __init__(self, name: str):
        self._name = name
        self._docs: List[Dict[str, Any]] = []
        self._seq = 0

    def insert_one(self, doc: Dict[str, Any]):
        if "_id" not in doc:
            self._seq += 1
            doc["_id"] = f"mem_{self._name}_{self._seq}"
        self._docs.append(dict(doc))
        return _InsertOneResult(doc["_id"])

    def update_one(self, filt: Dict[str, Any], upd: Dict[str, Any]):
        m = 0
        for d in self._docs:
            if all(d.get(k) == v for k, v in filt.items()):
                if "$set" in upd:
                    d.update(upd["$set"])
                m = 1
                break
        return _UpdateResult(m)

    def find(self, filt: Optional[Dict[str, Any]] = None):
        items = (
            self._docs
            if not filt
            else [d for d in self._docs if all(d.get(k) == v for k, v in filt.items())]
        )
        return _Cursor(items)

class _Cursor:
    def __init__(self, items: List[Dict[str, Any]]):
        self.items = items

    def sort(self, key: str, direction: int):
        rev = direction < 0
        self.items = sorted(
            self.items, key=lambda x: x.get(key, datetime.min), reverse=rev
        )
        return self

    def __iter__(self):
        return iter(self.items)

# --- try real Mongo; fall back quickly ---
try:
    _client = MongoClient(
        settings.MONGO_URI,
        serverSelectionTimeoutMS=1000,
        connectTimeoutMS=1000,
        tlsCAFile=certifi.where(),  # ✅ Fix for Atlas SSL certificates
    )
    _client.admin.command("ping")
    _db = _client[settings.MONGO_DB]
    sessions = _db["sessions"]
    answers = _db["answers"]
    DB_MODE = "mongo"
except Exception:
    sessions = _MemoryCollection("sessions")
    answers = _MemoryCollection("answers")
    DB_MODE = "memory"
