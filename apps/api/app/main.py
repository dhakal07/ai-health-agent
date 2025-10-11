# apps/api/app/main.py
from datetime import datetime
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from bson import ObjectId

from .settings import settings
from .db import sessions, answers


# ---------- FastAPI app & CORS ----------
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.ALLOWED_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Models ----------
class StartSessionBody(BaseModel):
    locale: str = "en-US"
    consent: bool = True

class PostAnswerBody(BaseModel):
    session_id: str
    question_id: int
    raw_transcript: str
    mapped_option: str
    confidence: float

class EndSessionBody(BaseModel):
    session_id: str


# ---------- Routes ----------
@app.get("/health")
def health():
    return {"status": "ok", "db": True}


@app.post("/session/start")
def start_session(body: StartSessionBody):
    """
    Creates a session document and returns its id.
    Using PyMongo (sync), so NO 'await'.
    """
    doc = {
        "locale": body.locale,
        "consent": body.consent,
        "started_at": datetime.utcnow(),
        "last_activity": datetime.utcnow(),
    }
    res = sessions.insert_one(doc)  # <-- sync call
    return {"session_id": str(res.inserted_id)}


@app.post("/answer")
def post_answer(body: PostAnswerBody):
    """
    Stores an answer and updates session's last_activity.
    """
    sid = ObjectId(body.session_id)
    answers.insert_one({
        "session_id": sid,
        "question_id": body.question_id,
        "raw_transcript": body.raw_transcript,
        "mapped_option": body.mapped_option,
        "confidence": body.confidence,
        "created_at": datetime.utcnow(),
    })
    sessions.update_one(
        {"_id": sid},
        {"$set": {"last_activity": datetime.utcnow()}}
    )
    return {"ok": True}


@app.post("/session/end")
def end_session(body: EndSessionBody):
    """
    Returns a lightweight summary of answers for this session.
    """
    sid = ObjectId(body.session_id)

    # Pull answers and build a tiny summary
    cursor = answers.find({"session_id": sid}).sort("created_at", 1)
    items = []
    for a in cursor:
        items.append({
            "question_id": a.get("question_id"),
            "mapped_option": a.get("mapped_option"),
            "confidence": a.get("confidence"),
        })

    # Mark session finished
    sessions.update_one(
        {"_id": sid},
        {"$set": {"finished_at": datetime.utcnow()}}
    )

    summary = {
        "count": len(items),
        "answers": items,
    }
    return {"summary": summary}
