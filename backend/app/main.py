# backend/app/main.py
from datetime import datetime
from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from bson import ObjectId
from pymongo.errors import PyMongoError

from app.core.config import settings
from app.db.mongodb import sessions, answers, DB_MODE

# ---------- FastAPI app & CORS ----------
app = FastAPI(title="AI Health Agent API", version="1.2")

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
    """Report API and (best-effort) DB status + mode."""
    try:
        # works for both real client and memory shim
        ok = True
    except Exception:
        ok = False
    return {"status": "ok", "db": (DB_MODE == "mongo"), "mode": DB_MODE}

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
    # memory returns string id, pymongo returns ObjectId
    sid = getattr(res, "inserted_id", res)
    return {"session_id": str(sid)}

@app.post("/answer")
def post_answer(body: PostAnswerBody):
    # accept memory ids (string) and real ObjectIds
    try:
        sid = ObjectId(body.session_id)
    except Exception:
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
            sid = session_id
        docs = list(answers.find({"session_id": sid}).sort("created_at", 1))
    except PyMongoError as e:
        raise HTTPException(status_code=503, detail=f"database_unavailable: {e.__class__.__name__}")

    for d in docs:
        d.pop("_id", None)
    return {"ok": True, "answers": docs}

def _score_and_note(items):
    """
    Very simple scoring:
    - count of 'agree' style answers / total
    - short, safe educational note (not diagnostic)
    """
    total = len(items)
    agree_opts = {"Definitely agree", "Slightly agree"}
    score = sum(1 for a in items if (a.get("mapped_option") in agree_opts))
    ratio = round((score / total), 2) if total else 0.0

    if ratio >= 0.8:
        note = "You show a strong preference for routine and consistency."
    elif ratio >= 0.5:
        note = "You show a moderate preference for structure and predictability."
    else:
        note = "You appear comfortable with change and flexible routines."

    # keep the language educational and non-diagnostic
    guidance = (
        "This is an educational reflection based on your answers. "
        "If you have concerns about your behavior or well-being, consider speaking with a qualified professional."
    )
    return {"score": score, "total": total, "ratio": ratio, "note": note, "guidance": guidance}

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
    scoring = _score_and_note(items)
    return {"summary": summary, "analysis": scoring}

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

    if _contains_any(t, EMERGENCY_SIGNS):
        return (
            f"{DISCLAIMER} Your message mentions potentially urgent warning signs. "
            "Please call your local emergency number or go to the nearest emergency department now."
        )

    if any(k in t for k in ["fever", "cold", "cough", "sore throat", "flu", "runny nose", "congestion"]):
        return (
            f"{DISCLAIMER} For typical cold/flu: rest, fluids, and over-the-counter symptom relief can help. "
            "Red flags: breathing trouble, chest pain, confusion, dehydration, fever >3–4 days, or rapid worsening."
        )

    if any(k in t for k in ["allergy", "allergies", "hay fever", "pollen"]):
        return (
            f"{DISCLAIMER} Allergy tips: avoid triggers, consider saline rinses and common antihistamines. "
            "If wheezing or breathing problems develop, seek care promptly."
        )

    if any(k in t for k in ["stomach", "nausea", "vomit", "diarrhea", "gastro"]):
        return (
            f"{DISCLAIMER} For mild stomach upset: hydrate with small frequent sips; oral rehydration can help. "
            "Seek care if there is blood, high fever, severe pain, dehydration, or symptoms >2–3 days."
        )

    if any(k in t for k in ["headache", "migraine"]):
        return (
            f"{DISCLAIMER} Headache tips: rest, hydrate, and consider simple pain relief if appropriate. "
            "Red flags: sudden worst headache, head injury, fever with stiff neck, vision/speech changes, weakness."
        )

    if any(k in t for k in ["anxiety", "panic", "worry", "stress"]):
        return (
            f"{DISCLAIMER} Try slow breathing (in 4s, hold 4s, out 6–8s), brief movement, and limiting caffeine. "
            "If anxiety interferes with life, a licensed therapist can help."
        )

    if any(k in t for k in ["depress", "low mood", "hopeless"]):
        return (
            f"{DISCLAIMER} Routines, sunlight, movement, and social contact can help mood. "
            "If thoughts of self-harm occur, contact local crisis services or a clinician immediately."
        )

    if any(k in t for k in ["sleep", "insomnia"]):
        return (
            f"{DISCLAIMER} Sleep tips: consistent schedule, cool/dark/quiet room, screens off before bed, "
            "keep caffeine earlier in the day. If snoring with pauses, discuss with a clinician."
        )

    if any(k in t for k in ["diet", "nutrition", "eat healthy", "weight", "obesity"]):
        return (
            f"{DISCLAIMER} Balanced plate: vegetables, lean protein, whole grains, healthy fats; fewer ultra-processed foods. "
            "Small steady changes beat extreme diets. A registered dietitian can tailor a plan."
        )

    if any(k in t for k in ["exercise", "workout", "physical activity"]):
        return (
            f"{DISCLAIMER} Aim for ~150 min/week of moderate activity plus two days of strength training if you can. "
            "Start gently and increase gradually; any movement helps."
        )

    if any(k in t for k in ["vaccine", "vaccination", "immunization"]):
        return (
            f"{DISCLAIMER} Vaccines reduce risk of severe illness. Recommendations depend on age, health, and local guidance. "
            "Your clinician or public health site can provide the latest advice."
        )

    if any(k in t for k in ["autism", "asd", "spectrum"]):
        return (
            f"{DISCLAIMER} Autism involves differences in communication, social interaction, and sensory processing. "
            "Only trained professionals can diagnose it. I can share general information and resources."
        )

    if t in {"hi", "hello", "hey"} or "hello" in t or "hi " in t:
        return f"{DISCLAIMER} Hello! How are you feeling today? I can share general wellness information."

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
