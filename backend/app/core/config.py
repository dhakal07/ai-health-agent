# backend/app/core/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from typing import Optional


class Settings(BaseSettings):
    # ──────── DATABASE ────────
    MONGO_URI: Optional[str] = Field(default=None, description="MongoDB connection string")
    MONGO_DB: str = Field(default="ai_health_agent", description="Database name")

    # ──────── SERVER / CORS ────────
    API_PORT: int = Field(default=8000, description="Backend port")
    ALLOWED_ORIGIN: str = Field(default="http://localhost:5173", description="Frontend origin")

    # ──────── GOOGLE PLACES API ────────
    GOOGLE_PLACES_API_KEY: Optional[str] = Field(
        default=None,
        description="Your secret Google Places API key – NEVER commit to GitHub!"
    )

    # ──────── Pydantic Settings ────────
    model_config = SettingsConfigDict(
        env_file=".env",          # auto-loads .env in backend/
        env_file_encoding="utf-8",
        extra="ignore",           # ignore unknown vars
        case_sensitive=False,     # allow GOOGLE_PLACES_API_KEY or google_places_api_key
    )


# Export one single instance
settings = Settings()