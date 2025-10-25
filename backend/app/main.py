# backend/app/main.py
from datetime import datetime
from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from bson import ObjectId
from pymongo.errors import PyMongoError

from app.core.config import settings
from app.db.mongodb import sessions, answers  # memory fallback handled inside

# ---------- FastAPI app & CORS ----------
app = FastAPI(title="AI Health Agent API", version="1.1")

origins: List[str] = list({
    getattr(settings, "ALLOWED_ORIGIN", "http://localhost:5173"),
    "http://localhost:5173",
    "http://127.0.0.1:5173",
})

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
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

class ChatBody(BaseModel):
    message: str

# ---------- Routes ----------
@app.get("/")
def root():
    return {"ok": True, "message": "AI Health Agent API", "try": ["/health", "/docs"]}

@app.get("/health")
def health():
    """Report API and (best-effort) DB status without hanging."""
    try:
        sessions.database.client.admin.command("ping")  # works for both real/memory shim
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ok", "db": db_ok}

@app.post("/session/start")
def start_session(body: StartSessionBody):
    """Creates a session or returns HTTP 503 if DB is unavailable (no hanging)."""
    doc = {
        "locale": body.locale,
        "consent": body.consent,
        "started_at": datetime.utcnow(),
        "last_activity": datetime.utcnow(),
    }
    try:
        res = sessions.insert_one(doc)
    except PyMongoError as e:
        raise HTTPException(status_code=503, detail=f"database_unavailable: {e.__class__.__name__}")
    return {"session_id": str(getattr(res, "inserted_id", res))}

@app.post("/answer")
def post_answer(body: PostAnswerBody):
    try:
        sid = ObjectId(body.session_id)
    except Exception:
        # memory fallback uses string ids; allow pass-through
        sid = body.session_id

    try:
        answers.insert_one({
            "session_id": sid,
            "question_id": body.question_id,
            "raw_transcript": body.raw_transcript,
            "mapped_option": body.mapped_option,
            "confidence": body.confidence,
            "created_at": datetime.utcnow(),
        })
        try:
            sessions.update_one({"_id": sid}, {"$set": {"last_activity": datetime.utcnow()}})
        except Exception:
            # memory mode may not match this exactly; ignore
            pass
    except PyMongoError as e:
        raise HTTPException(status_code=503, detail=f"database_unavailable: {e.__class__.__name__}")
    return {"ok": True}

@app.get("/session/{session_id}/answers")
def list_answers(session_id: str):
    try:
        try:
            sid = ObjectId(session_id)
        except Exception:
            sid = session_id  # memory id
        docs = list(answers.find({"session_id": sid}).sort("created_at", 1))
    except PyMongoError as e:
        raise HTTPException(status_code=503, detail=f"database_unavailable: {e.__class__.__name__}")

    for d in docs:
        d.pop("_id", None)
        # for memory mode, keep as-is
    return {"ok": True, "answers": docs}

@app.post("/session/end")
def end_session(body: EndSessionBody):
    try:
        try:
            sid = ObjectId(body.session_id)
        except Exception:
            sid = body.session_id
        cursor = answers.find({"session_id": sid}).sort("created_at", 1)
        items = [
            {
                "question_id": a.get("question_id"),
                "mapped_option": a.get("mapped_option"),
                "confidence": a.get("confidence"),
            }
            for a in cursor
        ]
        try:
            sessions.update_one({"_id": sid}, {"$set": {"finished_at": datetime.utcnow()}})
        except Exception:
            pass
    except PyMongoError as e:
        raise HTTPException(status_code=503, detail=f"database_unavailable: {e.__class__.__name__}")

    summary = {"count": len(items), "answers": items}
    return {"summary": summary}

# ---------- Smarter but safe /chat ----------
DISCLAIMER = (
    "I'm an educational demo avatar, not a medical professional. "
    "I don't diagnose or provide personalized medical advice. "
    "If this is urgent or you have severe symptoms, seek local emergency care."
)

EMERGENCY_SIGNS = [
    "severe chest pain", "crushing chest pain", "trouble breathing", "shortness of breath",
    "blue lips", "confusion", "cannot wake", "unconscious", "stroke", "numb on one side",
    "worst headache of my life", "suicidal", "suicide", "bleeding won't stop", "cant breathe",
]

def _contains_any(text: str, bag) -> bool:
    t = text.lower()
    return any(k in t for k in bag)

def _triage(text: str) -> str:
    t = text.lower().strip()

    # emergencies
    if _contains_any(t, EMERGENCY_SIGNS):
        return (
            f"{DISCLAIMER} Your message mentions potentially urgent warning signs. "
            "Please call your local emergency number or go to the nearest emergency department now."
        )

    # common topics
    if any(k in t for k in ["fever", "cold", "cough", "sore throat", "flu", "runny nose", "congestion"]):
        return (
            f"{DISCLAIMER} For typical cold/flu: rest, fluids, and over-the-counter symptom relief "
            "can help. Red flags: trouble breathing, chest pain, confusion, dehydration, "
            "fever lasting more than 3–4 days, or symptoms that rapidly worsen — seek in-person care."
        )

    if any(k in t for k in ["allergy", "allergies", "hay fever", "pollen"]):
        return (
            f"{DISCLAIMER} Allergy relief often includes avoiding triggers, saline rinses, "
            "and antihistamines. If you develop wheezing or breathing problems, seek care promptly."
        )

    if any(k in t for k in ["stomach", "nausea", "vomit", "vomiting", "diarrhea", "gastro"]):
        return (
            f"{DISCLAIMER} For mild stomach bugs: hydrate with small, frequent sips; consider oral "
            "rehydration solutions. Seek care if there is blood, signs of dehydration, high fever, "
            "severe belly pain, or symptoms last more than 2–3 days."
        )

    if any(k in t for k in ["headache", "migraine"]):
        return (
            f"{DISCLAIMER} Typical headaches improve with rest, hydration, and over-the-counter pain "
            "relief. Red flags: sudden severe or “worst ever” headache, head injury, fever with stiff neck, "
            "vision or speech problems, weakness, or confusion — seek urgent care."
        )

    if any(k in t for k in ["anxiety", "panic", "worry", "stress"]):
        return (
            f"{DISCLAIMER} For anxiety: try slow breathing (in 4s, hold 4s, out 6–8s for a few minutes), "
            "brief movement, and limiting caffeine. If anxiety interferes with daily life, consider talking "
            "to a licensed therapist or your clinician."
        )

    if any(k in t for k in ["depress", "low mood", "hopeless"]):
        return (
            f"{DISCLAIMER} Low mood can improve with routine, sunlight, movement, and social contact. "
            "For persistent symptoms or thoughts of self-harm, contact local crisis services or your clinician."
        )

    if any(k in t for k in ["sleep", "insomnia"]):
        return (
            f"{DISCLAIMER} Sleep tips: consistent schedule, dark/cool/quiet room, limit screens and heavy "
            "meals before bed, and keep caffeine earlier in the day. If snoring with pauses or daytime "
            "sleepiness, discuss with a clinician."
        )

    if any(k in t for k in ["diet", "nutrition", "eat healthy", "weight", "obesity"]):
        return (
            f"{DISCLAIMER} A balanced plate (vegetables, lean protein, whole grains, healthy fats) and "
            "fewer ultra-processed foods can help. Small, steady changes beat extreme diets. For medical "
            "conditions, a registered dietitian can tailor a plan."
        )

    if any(k in t for k in ["exercise", "workout", "physical activity"]):
        return (
            f"{DISCLAIMER} Aim for about 150 minutes per week of moderate activity plus two days of "
            "strength training if you can. Start gently and increase gradually; any movement helps."
        )

    if any(k in t for k in ["vaccine", "vaccination", "immunization"]):
        return (
            f"{DISCLAIMER} Vaccines reduce risk of severe illness. Recommended schedules depend on age, "
            "health, and local guidelines. Your clinician or public health site can provide the latest "
            "advice for your region."
        )

    if any(k in t for k in ["autism", "asd", "spectrum"]):
        return (
            f"{DISCLAIMER} Autism involves differences in communication, social interaction, and sensory "
            "processing. Only trained professionals can diagnose it. If you have questions, I can share "
            "general information and resources."
        )

    # small talk
    if t in {"hi", "hello", "hey"} or "hello" in t or "hi " in t:
        return f"{DISCLAIMER} Hello! How are you feeling today? I can share general wellness information."

    # default
    return (
        f"{DISCLAIMER} Tell me what general topic you want to know about (sleep, headaches, anxiety, "
        "cold/flu, vaccines, nutrition, exercise, etc.)."
    )

@app.post("/chat")
def chat(body: ChatBody):
    msg = (body.message or "").strip()
    if not msg:
        return {"ok": True, "answer": f"{DISCLAIMER} Please enter a short question or topic."}
    answer = _triage(msg)
    return {"ok": True, "answer": answer}
