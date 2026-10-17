import { supabase } from "@/lib/supabase";
import type { RiskResult, TelemetryFeatures } from "@/lib/types";

// Calls the server-side risk engine Edge Function.
// The browser never chooses the user ID, risk score, or session status —
// the server extracts the user from the JWT and computes everything.
export async function scoreWindow(
  features: TelemetryFeatures,
  windowKey: string,
  simulated = false
): Promise<RiskResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return {
      trust_score: 0, risk_level: "HIGH", confidence: 0,
      reasons: [], latency_ms: 0, cold_start: false,
      simulated, session_status: "REVOKED", replay_rejected: false,
      error: "No authenticated session",
    };
  }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/risk-scorer`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ window_key: windowKey, features, simulated }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    return {
      trust_score: 0, risk_level: "HIGH", confidence: 0,
      reasons: [json?.error ?? `Request failed (${res.status})`],
      latency_ms: 0, cold_start: false, simulated,
      session_status: res.status === 403 ? "REVOKED" : "ACTIVE",
      replay_rejected: res.status === 409,
      error: json?.error ?? `Request failed (${res.status})`,
    };
  }

  return {
    trust_score: json.trust_score ?? 0,
    risk_level: json.risk_level ?? "LOW",
    confidence: json.confidence ?? 0,
    reasons: json.reasons ?? [],
    latency_ms: json.latency_ms ?? 0,
    cold_start: json.cold_start ?? false,
    simulated: json.simulated ?? simulated,
    session_status: json.session_status ?? "ACTIVE",
    replay_rejected: json.replay_rejected ?? false,
    error: json.error,
  };
}

// Replay test: re-send a previously submitted window using its original key.
export async function replayWindow(windowKey: string): Promise<RiskResult> {
  // Send dummy features — the server will reject on the unique key before scoring.
  const dummy: TelemetryFeatures = {
    mouse_speed_mean: 0, mouse_speed_std: 0, mouse_curvature: 0,
    scroll_speed_mean: 0, scroll_speed_std: 0, nav_flow_deviation: 0,
    keystroke_timing_mean: 0, keystroke_timing_std: 0, idle_ratio: 0,
    event_count: 0,
  };
  return scoreWindow(dummy, windowKey, false);
}
