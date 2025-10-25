from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Load backend/.env and ignore any extra keys we don't model yet.
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- database ---
    MONGO_URI: str
    MONGO_DB: str = "ai_health_agent"

    # --- server / cors ---
    API_PORT: int = 8000
    ALLOWED_ORIGIN: str = "http://localhost:5173"

settings = Settings()
