
from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: EmailStr


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class TelemetryFeatures(BaseModel):
    mouse_speed_mean: float = Field(default=0, ge=0, le=100000)
    mouse_speed_std: float = Field(default=0, ge=0, le=100000)
    mouse_curvature: float = Field(default=0, ge=0, le=100000)
    scroll_speed_mean: float = Field(default=0, ge=0, le=100000)
    scroll_speed_std: float = Field(default=0, ge=0, le=100000)
    nav_flow_deviation: float = Field(default=0, ge=0, le=100000)
    keystroke_timing_mean: float = Field(default=0, ge=0, le=100000)
    keystroke_timing_std: float = Field(default=0, ge=0, le=100000)
    idle_ratio: float = Field(default=0, ge=0, le=1)
    event_count: int = Field(default=0, ge=0, le=1000000)


class RiskScoreRequest(BaseModel):
    window_key: str = Field(min_length=1, max_length=200)
    features: TelemetryFeatures
    simulated: bool = False


class RiskScoreResponse(BaseModel):
    trust_score: float
    risk_level: str
    confidence: float
    reasons: list[str]
    latency_ms: float
    cold_start: bool
    simulated: bool
    session_status: str
    replay_rejected: bool = False
    error: str | None = None
