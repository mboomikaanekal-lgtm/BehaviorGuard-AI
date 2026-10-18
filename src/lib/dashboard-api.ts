
import { apiRequest } from "@/lib/api";
import { getAccessToken } from "@/lib/auth-context";
import type { RiskEventRow, SessionRow } from "@/lib/types";

interface BackendRiskEvent {
  id: number;
  trust_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  reason: string;
  confidence: number;
  latency_ms: number;
  simulated: boolean;
  created_at: string;
}

function getToken(): string {
  const token = getAccessToken();

  if (!token) {
    throw new Error("Please sign in again.");
  }

  return token;
}

function mapEvent(event: BackendRiskEvent): RiskEventRow {
  const reasonParts = event.reason.split(" | ");
  const reasonText =
    reasonParts.length > 1
      ? reasonParts.slice(1).join(" | ")
      : event.reason;

  return {
    id: String(event.id),
    user_id: "",
    window_id: null,
    trust_score: event.trust_score,
    risk_level: event.risk_level,
    confidence: event.confidence,
    reasons: reasonText
      .split(";")
      .map((reason) => reason.trim())
      .filter(Boolean),
    latency_ms: event.latency_ms,
    simulated: event.simulated,
    created_at: event.created_at,
  };
}

async function loadEvents(): Promise<BackendRiskEvent[]> {
  return apiRequest<BackendRiskEvent[]>(
    "/api/risk/events",
    {},
    getToken()
  );
}

export async function fetchSession(
  _userId: string
): Promise<SessionRow | null> {
  // Session details are not yet fully exposed by the backend.
  return null;
}

export async function fetchRiskEvents(
  _userId: string,
  limit = 50
): Promise<RiskEventRow[]> {
  const events = await loadEvents();

  return events.slice(0, limit).map(mapEvent);
}

export async function fetchWindowCount(
  _userId: string
): Promise<number> {
  const events = await loadEvents();

  return events.length;
}

export async function fetchRecentAlerts(
  _userId: string,
  limit = 5
): Promise<RiskEventRow[]> {
  const events = await loadEvents();

  return events
    .filter(
      (event) =>
        event.risk_level === "MEDIUM" ||
        event.risk_level === "HIGH"
    )
    .slice(0, limit)
    .map(mapEvent);
}

export async function resetDemoData(
  _userId: string
): Promise<void> {
  throw new Error(
    "Reset is not available in the local backend yet."
  );
}

export async function unlockSession(
  _userId: string
): Promise<void> {
  throw new Error(
    "Session unlock is not available in the local backend yet."
  );
}
