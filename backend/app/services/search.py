# backend/app/services/search.py
from __future__ import annotations
import json, math, re
from pathlib import Path
from typing import Dict, List, Tuple

KB_PATH = Path(__file__).resolve().parent.parent / "kb" / "data.json"
_WORD = re.compile(r"[a-zA-Z]+(?:'[a-z]+)?")

def _tok(s: str) -> List[str]:
    return [w.lower() for w in _WORD.findall(s)]

def load_kb() -> List[Dict]:
    with KB_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)

KB = load_kb()

def score(query: str, doc: Dict) -> float:
    """Lightweight score = tag hits + token overlap (no heavy deps)."""
    q = query.lower()
    q_tokens = set(_tok(query))
    tags = doc.get("tags", [])
    text = " ".join([doc.get("title",""), doc.get("summary",""), " ".join(tags)])
    d_tokens = set(_tok(text))

    tag_hits = sum(1 for t in tags if t in q)  # substring presence for tags
    overlap = len(q_tokens & d_tokens)
    len_penalty = 1.0 / math.sqrt(len(d_tokens) + 1)

    return tag_hits * 3.0 + overlap * 1.2 * len_penalty

def top_k(query: str, k: int = 3) -> List[Tuple[Dict, float]]:
    scored = [(doc, score(query, doc)) for doc in KB]
    scored.sort(key=lambda x: x[1], reverse=True)
    return [(d, s) for d, s in scored[:k] if s > 0.1]
