# backend/app/main.py
# FINAL VERSION – LLAMA3 FIRST, HISTORY-AWARE, FINLAND-READY
from datetime import datetime
from typing import List, Optional, Dict
import os
import requests

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from bson import ObjectId
from pymongo.errors import PyMongoError

from app.core.config import settings
from app.db.mongodb import sessions, answers, DB_MODE

# ---------- FastAPI app & CORS ----------
app = FastAPI(title="AI Health Agent API", version="3.0")

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    getattr(settings, "ALLOWED_ORIGIN", "http://localhost:5173")
]

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
    location: Optional[dict] = None  # { lat: float, lng: float }
    history: Optional[List[dict]] = None  # [{role: "user"/"assistant", content: str}, ...]

# ---------- Basic Routes ----------
@app.get("/")
def root():
    return {"ok": True, "message": "AI Health Agent v3.0 – Llama3 First, Finland Ready"}

@app.get("/health")
def health():
    return {"status": "ok", "db": DB_MODE == "mongo", "mode": DB_MODE}

# ---------- Session & Answers ----------
def _get_sid(sid_str: str):
    try:
        return ObjectId(sid_str)
    except:
        return sid_str

@app.post("/session/start")
def start_session(body: StartSessionBody):
    doc = {
        "locale": body.locale,
        "consent": body.consent,
        "started_at": datetime.utcnow(),
        "last_activity": datetime.utcnow(),
    }
    try:
        res = sessions.insert_one(doc)
        return {"session_id": str(res.inserted_id)}
    except PyMongoError as e:
        raise HTTPException(503, f"db_error: {e.__class__.__name__}")

@app.post("/answer")
def post_answer(body: PostAnswerBody):
    sid = _get_sid(body.session_id)
    try:
        answers.insert_one({
            **body.dict(),
            "session_id": sid,
            "created_at": datetime.utcnow(),
        })
        sessions.update_one({"_id": sid}, {"$set": {"last_activity": datetime.utcnow()}})
    except PyMongoError as e:
        raise HTTPException(503, f"db_error: {e.__class__.__name__}")
    return {"ok": True}

@app.get("/session/{session_id}/answers")
def list_answers(session_id: str):
    sid = _get_sid(session_id)
    try:
        docs = list(answers.find({"session_id": sid}).sort("created_at", 1))
        for d in docs:
            d.pop("_id", None)
        return {"ok": True, "answers": docs}
    except PyMongoError as e:
        raise HTTPException(503, f"db_error: {e.__class__.__name__}")

@app.post("/session/end")
def end_session(body: EndSessionBody):
    sid = _get_sid(body.session_id)
    try:
        cursor = answers.find({"session_id": sid}).sort("created_at", 1)
        items = [{"question_id": a.get("question_id"), "mapped_option": a.get("mapped_option")} for a in cursor]
        sessions.update_one({"_id": sid}, {"$set": {"finished_at": datetime.utcnow()}})
    except PyMongoError as e:
        raise HTTPException(503, f"db_error: {e.__class__.__name__}")

    total = len(items)
    agree = sum(1 for i in items if i.get("mapped_option") in {"Definitely agree", "Slightly agree"})
    ratio = round(agree / total, 2) if total else 0
    note = (
        "Strong preference for routine." if ratio >= 0.8 else
        "Moderate preference for structure." if ratio >= 0.5 else
        "Comfortable with change."
    )
    return {
        "summary": {"count": total, "answers": items},
        "analysis": {"score": agree, "ratio": ratio, "note": note}
    }

# ---------- Emergency ----------
EMERGENCY_KEYWORDS = [
    "chest pain", "crushing", "trouble breathing", "cant breathe", "heart attack",
    "stroke", "numb", "worst headache", "choking", "allergic reaction", "suicide"
]

def _is_emergency(text: str) -> bool:
    return any(k in text.lower() for k in EMERGENCY_KEYWORDS)

# ---------- REAL CLINICS ----------
PLACES_KEY = settings.GOOGLE_PLACES_API_KEY or os.getenv("GOOGLE_PLACES_API_KEY")

def get_nearby_hospitals(lat: float, lng: float):
    fallback = [
        {"name": "Terveystalo Jumbo", "maps_url": "https://maps.app.goo.gl/9kLm"},
        {"name": "Mehiläinen Vantaa", "maps_url": "https://maps.app.goo.gl/5vXj"}
    ]
    if not PLACES_KEY:
        return fallback

    try:
        res = requests.get(
            "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
            params={
                "location": f"{lat},{lng}",
                "radius": 8000,
                "type": "hospital",
                "keyword": "Terveystalo OR Mehiläinen OR HUS OR sairaala",
                "key": PLACES_KEY
            },
            timeout=7
        ).json()
        results = res.get("results", [])[:6]
        hospitals = []
        for r in results:
            name = r.get("name", "")
            if any(bad in name.lower() for bad in ["päiväkoti", "koulu", "lasten", "daycare"]):
                continue
            pid = r.get("place_id")
            if pid:
                hospitals.append({
                    "name": name,
                    "maps_url": f"https://www.google.com/maps/search/?api=1&query_place_id={pid}"
                })
        return hospitals[:3] or fallback
    except:
        return fallback

# ---------- Rule-based Fallback ----------
def _rule_based(text: str) -> str:
    t = text.lower().strip()

    if any(k in t for k in ["skin", "rash", "itch", "itchy", "eczema", "hives", "red spots", "skin irritation"]):
        return (
            "For mild skin irritation: rinse gently with lukewarm water, avoid harsh soaps and scratching, "
            "and use a simple fragrance-free moisturiser. If there is spreading redness, strong pain, fever, "
            "blistering, or swelling around the eyes or mouth, see a doctor or clinic urgently."
        )

    if any(k in t for k in ["hair fall", "hair loss", "losing hair", "thinning hair", "bald patch"]):
        return (
            "Gradual hair shedding can be linked to stress, recent illness, hormone changes, or nutritional factors. "
            "Gentle hair care, avoiding tight hairstyles and harsh treatments, and a balanced diet with enough protein, "
            "iron and vitamins can support hair health. If hair comes out in clumps, there are bald patches, or you feel "
            "unwell otherwise, discuss it with a doctor."
        )

    if any(k in t for k in ["fever", "cold", "cough", "sore throat", "flu", "runny nose", "congestion"]):
        return (
            "For typical cold or flu, rest, fluids, and simple over-the-counter symptom relief can help. "
            "Warning signs include trouble breathing, chest pain, confusion, dehydration, or fever lasting more than 3–4 days."
        )

    if any(k in t for k in ["stomach", "nausea", "vomit", "diarrhea", "diarrhoea", "gastro"]):
        return (
            "For mild stomach upset, small frequent sips of fluids and oral rehydration solutions are helpful. "
            "Seek medical care if there is blood in vomit or stool, high fever, strong abdominal pain, or signs of dehydration."
        )

    if any(k in t for k in ["headache", "migraine"]):
        return (
            "For many headaches, rest, hydration, and simple pain relief can be useful. "
            "Sudden 'worst ever' headache, headache after a head injury, fever with stiff neck, or problems with speech or vision are reasons to seek urgent care."
        )

    if any(k in t for k in ["sleep", "insomnia", "cant sleep", "can't sleep"]):
        return (
            "For better sleep, try a consistent schedule, a dark and quiet bedroom, limiting screens before bed, "
            "and keeping caffeine earlier in the day. Loud snoring with pauses in breathing or severe daytime sleepiness should be checked by a professional."
        )

    if any(k in t for k in ["anxiety", "panic", "worry", "stress"]):
        return (
            "For anxiety or stress, slow breathing, brief movement or walking, and talking with someone you trust can help. "
            "If anxiety interferes with daily life or you feel you might harm yourself, contact health or crisis services."
        )

    if any(k in t for k in ["depress", "low mood", "hopeless"]):
        return (
            "Low mood can improve with routines, light, movement, and social contact, but persistent sadness or loss of interest is worth discussing with a professional. "
            "If you have thoughts of self-harm or suicide, seek urgent help immediately."
        )

    return (
        "I can share general wellness info on sleep, headaches, anxiety, cold/flu, vaccines, nutrition, exercise, and more. "
        "For serious, new, or rapidly worsening symptoms, please seek in-person medical care."
    )

# ---------- Ollama ----------
try:
    import ollama
    HAVE_OLLAMA = True
except:
    HAVE_OLLAMA = False

# ---------- CHAT: LLAMA3 FIRST ----------
COUNTRY_EMERGENCY = "112"

@app.post("/chat")
async def chat(body: ChatBody):
    user_input = (body.message or "").strip()
    location = body.location or None
    history = body.history or []

    if not user_input:
        return {"ok": True, "answer": "Please enter a short question or topic."}

    # 1. EMERGENCY
    if _is_emergency(user_input):
        hospitals = []
        if location and "lat" in location and "lng" in location:
            hospitals = get_nearby_hospitals(float(location["lat"]), float(location["lng"]))
        hos_text = "\n".join(
            f"* {h['name']} — [Open in Maps]({h['maps_url']})" if h.get("maps_url") else f"* {h['name']}"
            for h in hospitals
        ) if hospitals else "* (Nearby ERs will appear when location is shared.)"

        return {
            "ok": True,
            "answer": f"**EMERGENCY ALERT**\n\nCALL {COUNTRY_EMERGENCY} IMMEDIATELY — DO NOT WAIT.\n\nNearest ER:\n{hos_text}\n\nStay calm.",
            "hospitals": hospitals,
            "emergency": True
        }

    # 2. LLAMA3 FIRST
    llm_answer = None
    if HAVE_OLLAMA:
        try:
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are a friendly health educator in Finland. Give short, practical, educational tips (2–4 sentences). "
                        "Never diagnose. If serious, say: 'If severe or worsening, call 112 or visit a clinic.' "
                        "Be conversational and refer to previous messages if relevant."
                    )
                }
            ]
            for msg in history[-6:]:
                if msg.get("role") in {"user", "assistant"} and msg.get("content"):
                    messages.append({"role": msg["role"], "content": msg["content"]})
            messages.append({"role": "user", "content": user_input})

            resp = ollama.chat(model="llama3", messages=messages)
            llm_answer = resp.get("message", {}).get("content", "").strip()
            print("LLM answer used")
        except Exception as e:
            print("Ollama error:", e)

    if llm_answer:
        return {"ok": True, "answer": llm_answer}

    # 3. FALLBACK
    return {"ok": True, "answer": _rule_based(user_input)}