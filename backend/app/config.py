import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    SECRET_KEY: str = "dev_secret_key_change_in_production_123456789"
    DATABASE_PATH: str = "data/db/etfolio.sqlite3"
    ATTACHMENTS_DIR: str = "data/files"
    REGISTRATION_OPEN: bool = True
    MAX_UPLOAD_MB: int = 10
    TZ: str = "Australia/Sydney"
    COOKIE_SECURE: bool = False
    TESTING: bool = False
    SCHEDULER_ENABLED: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
