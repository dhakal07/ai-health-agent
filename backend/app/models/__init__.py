from pydantic import BaseModel
from typing import Optional

class StartSessionReq(BaseModel):
    locale: Optional[str] = "en-US"
    consent: bool = True

class StartSessionResp(BaseModel):
    session_id: str
    questions_count: int

class AnswerReq(BaseModel):
    session_id: str
    question_id: int
    raw_transcript: str
    mapped_option: str
    confidence: float

class EndSessionReq(BaseModel):
    session_id: str
