from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://mc_user:mc_password@localhost:5432/mission_control"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    jwt_secret: str = "mission-control-dev-secret-change-in-prod"
    jwt_algorithm: str = "HS256"
    jwt_expiry_minutes: int = 1440  # 24 hours

    # CORS
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # Logging
    log_level: str = "INFO"

    # Agent defaults — Anthropic OAuth tokens (loaded from .env, never hardcoded)
    anthropic_api_key: str = ""          # Primary OAuth token
    anthropic_api_key_backup: str = ""   # Failover token if primary auth fails
    default_model: str = "claude-sonnet-4-6"
    heartbeat_timeout_seconds: int = 120
    cost_aggregation_interval_seconds: int = 300
    alert_check_interval_seconds: int = 60

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
