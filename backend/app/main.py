# backend/app/main.py
from datetime import datetime
from typing import List, Optional, Tuple
import os, html, requests

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from bson import ObjectId
from pymongo.errors import PyMongoError

from app.core.config import settings
from app.db.mongodb import sessions, answers, DB_MODE

app = FastAPI(title="AI Health Agent API", version="1.6")

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

# ---------------- Models ----------------
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
    location: Optional[dict] = None  # {lat: float, lng: float}

# ---------------- Core routes ----------------
@app.get("/")
def root():
    return {"ok": True, "message": "AI Health Agent API", "try": ["/health", "/docs"]}

@app.get("/health")
def health():
    return {"status": "ok", "db": (DB_MODE == "mongo"), "mode": DB_MODE}

@app.post("/session/start")
def start_session(body: StartSessionBody):
    doc = {
        "locale": body.locale, "consent": body.consent,
        "started_at": datetime.utcnow(), "last_activity": datetime.utcnow(),
    }
    try:
        res = sessions.insert_one(doc)
    except PyMongoError as e:
        raise HTTPException(status_code=503, detail=f"database_unavailable: {e.__class__.__name__}")
    sid = getattr(res, "inserted_id", res)
    return {"session_id": str(sid)}

@app.post("/answer")
def post_answer(body: PostAnswerBody):
    try: sid = ObjectId(body.session_id)
    except Exception: sid = body.session_id
    try:
        answers.insert_one({
            "session_id": sid, "question_id": body.question_id,
            "raw_transcript": body.raw_transcript, "mapped_option": body.mapped_option,
            "confidence": body.confidence, "created_at": datetime.utcnow(),
        })
        try: sessions.update_one({"_id": sid}, {"$set": {"last_activity": datetime.utcnow()}})
        except Exception: pass
    except PyMongoError as e:
        raise HTTPException(status_code=503, detail=f"database_unavailable: {e.__class__.__name__}")
    return {"ok": True}

@app.get("/session/{session_id}/answers")
def list_answers(session_id: str):
    try:
        try: sid = ObjectId(session_id)
        except Exception: sid = session_id
        docs = list(answers.find({"session_id": sid}).sort("created_at", 1))
    except PyMongoError as e:
        raise HTTPException(status_code=503, detail=f"database_unavailable: {e.__class__.__name__}")
    for d in docs: d.pop("_id", None)
    return {"ok": True, "answers": docs}

def _score_and_note(items):
    total = len(items)
    agree_opts = {"Definitely agree", "Slightly agree"}
    score = sum(1 for a in items if a.get("mapped_option") in agree_opts)
    ratio = round((score / total), 2) if total else 0.0
    if ratio >= 0.8:
        note = "You show a strong preference for routine and consistency."
    elif ratio >= 0.5:
        note = "You show a moderate preference for structure and predictability."
    else:
        note = "You appear comfortable with change and flexible routines."
    guidance = ("This is an educational reflection based on your answers. "
                "If you have concerns about your well-being, consider speaking with a qualified professional.")
    return {"score": score, "total": total, "ratio": ratio, "note": note, "guidance": guidance}

@app.post("/session/end")
def end_session(body: EndSessionBody):
    try:
        try: sid = ObjectId(body.session_id)
        except Exception: sid = body.session_id
        items = [{
            "question_id": a.get("question_id"),
            "mapped_option": a.get("mapped_option"),
            "confidence": a.get("confidence"),
        } for a in answers.find({"session_id": sid}).sort("created_at", 1)]
        try: sessions.update_one({"_id": sid}, {"$set": {"finished_at": datetime.utcnow()}})
        except Exception: pass
    except PyMongoError as e:
        raise HTTPException(status_code=503, detail=f"database_unavailable: {e.__class__.__name__}")
    return {"summary": {"count": len(items), "answers": items}, "analysis": _score_and_note(items)}

# ---------------- Smart Chat ----------------
DISCLAIMER = (
    "I'm an educational demo avatar, not a medical professional. "
    "I don't diagnose or provide personalized medical advice. "
    "If this is urgent or you have severe symptoms, seek local emergency care."
)

EMERGENCY_SIGNS = [
    "severe chest pain","crushing chest pain","trouble breathing","shortness of breath","blue lips",
    "confusion","cannot wake","unconscious","stroke","numb on one side","worst headache of my life",
    "suicidal","suicide","bleeding won't stop","cant breathe","chest pain","heart attack",
    "allergic reaction","choking"
]
def _contains_any(text: str, bag) -> bool:
    t = text.lower()
    return any(k in t for k in bag)
def _is_emergency(text: str) -> bool:
    return _contains_any(text, EMERGENCY_SIGNS)

# --- Google Places ---
PLACES_KEY = settings.GOOGLE_PLACES_API_KEY or os.getenv("GOOGLE_PLACES_API_KEY")
def get_nearby_hospitals(lat: float, lng: float):
    if not PLACES_KEY: return []
    try:
        url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
        params = {"location": f"{lat},{lng}", "radius": 7000, "type": "hospital", "key": PLACES_KEY}
        res = requests.get(url, params=params, timeout=6).json()
        out = []
        for r in res.get("results", [])[:3]:
            out.append({
                "name": r.get("name", "Hospital"),
                "maps_url": f"https://www.google.com/maps/search/?api=1&query=Google&query_place_id={r.get('place_id')}"
                            if r.get("place_id") else None
            })
        return out
    except Exception:
        return []

# --- Optional local LLM (Ollama) ---
try:
    import ollama
    HAVE_OLLAMA = True
except Exception:
    HAVE_OLLAMA = False

COUNTRY_EMERGENCY = "112"  # Finland/EU

# --- New: light classifier + responses + follow-ups ---
def classify(text: str) -> str:
    t = text.lower().strip()
    if _is_emergency(t): return "emergency"
    if any(k in t for k in ["headache","migraine"]): return "headache"
    if any(k in t for k in ["eye","vision","red eye","itchy eye","eye pain","eye strain"]): return "eye"
    if any(k in t for k in ["nose","sinus","sinusitis","runny nose","blocked nose","nostril","nose pain"]): return "nose"
    if any(k in t for k in ["earache","ear pain","ringing ear","tinnitus","ear infection"]): return "ear"
    if any(k in t for k in ["sore throat","throat pain","tonsil","swallowing pain"]): return "throat"
    if any(k in t for k in ["tooth","dental","gum","toothache"]): return "tooth"
    if any(k in t for k in ["back pain","lower back","neck pain","shoulder pain","knee pain","hip pain","ankle pain","joint pain","muscle strain","sprain","pain in"]): 
        return "musculoskeletal"
    if any(k in t for k in ["rash","hives","eczema","skin","itch","bites"]): return "skin"
    if any(k in t for k in ["constipation","hard stool","no bowel"]): return "constipation"
    if any(k in t for k in ["urination pain","burning urine","pee pain","uti","urinary infection"]): return "uti"
    if any(k in t for k in ["period pain","cramps","menstrual cramps","dysmenorrhea"]): return "period"
    if any(k in t for k in ["fever","cold","cough","flu","sore throat","runny nose","congestion"]): return "coldflu"
    if any(k in t for k in ["anxiety","panic","worry","stress"]): return "anxiety"
    if any(k in t for k in ["sleep","insomnia"]): return "sleep"
    if any(k in t for k in ["diet","nutrition","eat healthy","weight","obesity"]): return "diet"
    if any(k in t for k in ["exercise","workout","physical activity"]): return "exercise"
    return "unknown"

def advice_and_followups(kind: str) -> Tuple[str, list]:
    fups = []
    if kind == "headache":
        text = ("Try rest, hydration, and simple pain relief if appropriate. "
                "Red flags: sudden 'worst headache', head injury, fever with stiff neck, vision/speech changes, weakness.")
    elif kind == "eye":
        text = ("Eye irritation is often due to dryness, screen strain, or allergy. Use artificial tears, take screen breaks, "
                "and avoid rubbing. Seek care for vision changes, severe pain, light sensitivity, or injury.")
        fups = ["Is the eye red or light-sensitive?", "Any vision changes or injury?", "Do you wear contacts?"]
    elif kind == "nose":
        text = ("Nasal pain/congestion may relate to a cold, sinus irritation, or allergy. Rinsing with saline, hydration, "
                "and short-term decongestants can help. Seek care for high fever, facial swelling, or severe persistent pain.")
        fups = ["Is there congestion or runny nose?", "Any fever or facial pressure?", "Any recent injury to the nose?"]
    elif kind == "ear":
        text = ("Ear pain can follow a cold or wax buildup. Gentle pain relief and warm compresses may help. "
                "Seek care for fever, drainage, severe pain, or hearing loss.")
        fups = ["Do you have fever or ear drainage?", "Any hearing loss or ringing?"]
    elif kind == "throat":
        text = ("Sore throat often improves with rest, fluids, and salt-water gargles. "
                "Seek care for trouble breathing, drooling, severe pain, or fever >3–4 days.")
        fups = ["Any fever or swollen glands?", "Trouble swallowing or breathing?"]
    elif kind == "tooth":
        text = ("Tooth/gum pain usually needs a dentist. Rinse with warm salt water and consider simple pain relief. "
                "Urgent care for fever, facial swelling, or trauma.")
        fups = ["Is there swelling or fever?", "Was there a broken tooth or injury?"]
    elif kind == "musculoskeletal":
        text = ("For mild sprains/strains or joint pain: rest, ice/heat, compression, and gentle movement as tolerated. "
                "Seek care for severe pain, deformity, numbness, or if you cannot bear weight.")
        fups = ["Was there a recent injury?", "Is there swelling or numbness?", "Can you bear weight or move the joint?"]
    elif kind == "skin":
        text = ("For mild rashes/itch: gentle washing, moisturiser, cool compresses; consider antihistamine if itchy. "
                "Seek care for spreading rash, fever, or signs of infection.")
        fups = ["Is the rash spreading or painful?", "Any fever?", "New soap, detergent, or bites?"]
    elif kind == "constipation":
        text = ("Increase fibre (fruits/veg/whole grains), fluids, and activity. Short-term stool softener may help. "
                "Seek care for severe pain, vomiting, blood, or no gas/stool with belly swelling.")
        fups = ["How many days without bowel movement?", "Any blood or severe pain?"]
    elif kind == "uti":
        text = ("Burning urination may suggest a UTI. Hydration helps; avoid bladder irritants. "
                "Seek care for fever, back pain, or if symptoms persist.")
        fups = ["Any fever or back pain?", "Increased frequency/urgency?"]
    elif kind == "period":
        text = ("For menstrual cramps: heat pack, gentle movement, hydration, and simple pain relief if appropriate. "
                "Seek care for unusually heavy bleeding, fainting, or pregnancy concerns.")
        fups = ["How heavy is the bleeding?", "Any chance of pregnancy?"]
    elif kind == "coldflu":
        text = ("For colds/flu: rest, fluids, and OTC symptom relief. "
                "Seek care for breathing trouble, chest pain, confusion, dehydration, or fever >3–4 days.")
    elif kind == "anxiety":
        text = ("Try slow breaths (in 4s, hold 4s, out 6–8s), brief movement, and limit caffeine. "
                "If anxiety affects daily life, a therapist can help.")
    elif kind == "sleep":
        text = ("Keep a consistent schedule, dark/cool/quiet room, and no screens before bed. "
                "Limit late caffeine and big meals; consider a short wind-down routine.")
    elif kind == "diet":
        text = ("Aim for veg/fruit, lean protein, whole grains, and healthy fats; reduce ultra-processed foods. "
                "Small steady changes beat extreme diets.")
    elif kind == "exercise":
        text = ("Work toward ~150 min/week moderate activity + 2 strength days. Start gently and increase gradually.")
    else:
        text = ("I can share general wellness info on sleep, headaches, anxiety, cold/flu, vaccines, nutrition, exercise, etc. "
                "For serious or worsening symptoms, seek in-person care.")
        fups = ["How long has this been going on?", "Any fever, injury, or severe pain?", "What makes it better or worse?"]
    return text, fups

@app.post("/chat")
async def chat(body: ChatBody):
    user_input = (body.message or "").strip()
    location = body.location or None
    if not user_input:
        return {"ok": True, "answer": "Please enter a short question or topic."}

    # Emergency first
    if _is_emergency(user_input):
        hospitals = []
        if location and "lat" in location and "lng" in location:
            hospitals = get_nearby_hospitals(float(location["lat"]), float(location["lng"]))
        hos_text = "\n".join([f"• {h['name']} — [Open in Maps]({h['maps_url']})" if h.get("maps_url") else f"• {h['name']}"
                              for h in hospitals]) if hospitals else "• (Nearby ERs will appear here when location is available.)"
        return {
            "ok": True,
            "answer": (f"EMERGENCY ALERT\n\nCALL {COUNTRY_EMERGENCY} IMMEDIATELY — DO NOT WAIT.\n\n"
                       f"Nearest ER:\n{hos_text}\n\nStay calm. Help is on the way."),
            "hospitals": hospitals,
            "emergency": True
        }

    # Classification + rule advice
    kind = classify(user_input)
    rule_text, followups = advice_and_followups(kind)

    # Optional LLM refinement
    if HAVE_OLLAMA:
        try:
            resp = ollama.chat(
                model="llama3",
                messages=[
                    {"role": "system", "content":
                        "You are a friendly health educator. Provide short, practical, educational guidance (2–4 sentences). "
                        "Never diagnose. If symptoms are severe/sudden, advise in-person care or calling 112 (Finland/EU)."},
                    {"role": "user", "content": user_input}
                ],
            )
            llm = resp.get("message", {}).get("content", "").strip()
            if llm:
                rule_text = llm
        except Exception:
            pass

    # Add a nearby option if we have location
    if location and PLACES_KEY:
        hs = get_nearby_hospitals(float(location["lat"]), float(location["lng"]))
        if hs:
            h = hs[0]
            rule_text += f"\n\nNearby option: {h['name']}" + (f" — [Open in Maps]({h['maps_url']})" if h.get("maps_url") else "")
            return {"ok": True, "answer": rule_text, "hospitals": hs, "follow_up": followups}

    return {"ok": True, "answer": rule_text, "follow_up": followups}
