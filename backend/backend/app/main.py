
from datetime import datetime, timedelta, timezone
import os
import time

import jwt
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from app.database import Base, engine, get_db
from app.models import User, UserSession, RiskEvent
from app.schemas import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
    RiskScoreRequest,
    RiskScoreResponse,
)

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="BehaviorGuard AI API",
    description="Behavioral risk detection and account protection API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

password_hash = PasswordHash.recommended()
bearer_scheme = HTTPBearer()

SECRET_KEY = os.environ.get(
    "BEHAVIORGUARD_SECRET_KEY",
    "local-development-only-change-this-secret",
)
ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = 60


@app.get("/")
def home():
    return {"message": "BehaviorGuard AI API is running"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.post(
    "/api/auth/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()

    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    user = User(
        email=email,
        password_hash=password_hash.hash(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user.id, "email": user.email},
    }


@app.post("/api/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()

    if not user or not password_hash.verify(
        payload.password, user.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(user.id)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user.id, "email": user.email},
    }


def create_access_token(user_id: int) -> str:
    expires = datetime.now(timezone.utc) + timedelta(
        minutes=TOKEN_EXPIRE_MINUTES
    )
    return jwt.encode(
        {"sub": str(user_id), "exp": expires},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(
            credentials.credentials,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists",
        )

    return user


@app.get("/api/auth/me", response_model=UserResponse)
def get_me(user: User = Depends(get_current_user)):
    return {"id": user.id, "email": user.email}


@app.post("/api/risk/score", response_model=RiskScoreResponse)
def score_risk(
    payload: RiskScoreRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    started = time.perf_counter()

    # Demo replay protection: reject an already recorded window key.
    # The window key is currently stored inside the event reason.
    existing = (
        db.query(RiskEvent)
        .filter(
            RiskEvent.user_id == user.id,
            RiskEvent.reason.like(
                f"%window:{payload.window_key}%"
            ),
        )
        .first()
    )

    if existing:
        return RiskScoreResponse(
            trust_score=existing.trust_score,
            risk_level=existing.risk_level,
            confidence=0.0,
            reasons=["This behavioral window was already submitted."],
            latency_ms=(time.perf_counter() - started) * 1000,
            cold_start=False,
            simulated=payload.simulated,
            session_status="ACTIVE",
            replay_rejected=True,
            error="Duplicate window key",
        )

    features = payload.features

    # Smooth demo scoring.
    # This is a heuristic, not a trained or validated ML model.
    risk = 0.0
    reasons = []

    # Navigation deviation: expected range 0 to 1.
    if features.nav_flow_deviation > 0.7:
        risk += min(
            30.0,
            (features.nav_flow_deviation - 0.7) * 60,
        )
        reasons.append("Navigation pattern differs from baseline")

    # Mouse movement variability.
    if features.mouse_speed_std > 200:
        risk += min(
            20.0,
            (features.mouse_speed_std - 200) / 30,
        )
        reasons.append("Mouse movement is unusually inconsistent")

    # Keystroke timing variability.
    if features.keystroke_timing_std > 100:
        risk += min(
            20.0,
            (features.keystroke_timing_std - 100) / 20,
        )
        reasons.append("Keystroke timing is unusually inconsistent")

    # Long idle periods.
    if features.idle_ratio > 0.5:
        risk += min(
            15.0,
            (features.idle_ratio - 0.5) * 30,
        )
        reasons.append("High idle ratio detected")

    # Insufficient events to assess behavior confidently.
    if features.event_count < 20:
        risk += min(
            15.0,
            (20 - features.event_count) * 0.75,
        )
        reasons.append("Insufficient behavioral events")

    trust_score = round(max(0.0, min(100.0, 100.0 - risk)), 1)

    if trust_score < 40:
        risk_level = "HIGH"
    elif trust_score < 70:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    if not reasons:
        reasons.append(
            "No major anomalies detected by the demo rules"
        )

    event = RiskEvent(
        user_id=user.id,
        trust_score=trust_score,
        risk_level=risk_level,
        reason=(
            f"window:{payload.window_key} | "
            + "; ".join(reasons)
        ),
    )
    db.add(event)

    session = (
        db.query(UserSession)
        .filter(
            UserSession.user_id == user.id,
            UserSession.status == "ACTIVE",
        )
        .first()
    )

    if not session:
        session = UserSession(
            user_id=user.id,
            status="ACTIVE",
        )
        db.add(session)

    session.last_score = trust_score

    # Demo only: do not revoke authentication automatically.
    db.commit()

    return RiskScoreResponse(
        trust_score=trust_score,
        risk_level=risk_level,
        confidence=(
            0.5 if features.event_count >= 5 else 0.2
        ),
        reasons=reasons,
        latency_ms=(time.perf_counter() - started) * 1000,
        cold_start=False,
        simulated=payload.simulated,
        session_status=session.status,
        replay_rejected=False,
        error=None,
    )


@app.get("/api/risk/events")
def get_risk_events(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    events = (
        db.query(RiskEvent)
        .filter(RiskEvent.user_id == user.id)
        .order_by(RiskEvent.created_at.desc())
        .limit(100)
        .all()
    )

    return [
        {
            "id": event.id,
            "trust_score": event.trust_score,
            "risk_level": event.risk_level,
            "reason": event.reason,
            "created_at": event.created_at.isoformat(),
        }
        for event in events
    ]
