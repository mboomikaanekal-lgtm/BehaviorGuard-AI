
import { apiRequest } from "@/lib/api";
import { getAccessToken } from "@/lib/auth-context";
import type { RiskResult, TelemetryFeatures } from "@/lib/types";

export async function scoreWindow(
  features: TelemetryFeatures,
  windowKey: string,
  simulated = false
): Promise<RiskResult> {
  const token = getAccessToken();

  if (!token) {
    return {
      trust_score: 0,
      risk_level: "HIGH",
      confidence: 0,
      reasons: ["Please log in before scoring behavior."],
      latency_ms: 0,
      cold_start: false,
      simulated,
      session_status: "REVOKED",
      replay_rejected: false,
      error: "No authenticated session",
    };
  }

  try {
    return await apiRequest<RiskResult>(
      "/api/risk/score",
      {
        method: "POST",
        body: JSON.stringify({
          window_key: windowKey,
          features,
          simulated,
        }),
      },
      token
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Risk scoring request failed";

    return {
      trust_score: 0,
      risk_level: "HIGH",
      confidence: 0,
      reasons: [message],
      latency_ms: 0,
      cold_start: false,
      simulated,
      session_status: "ACTIVE",
      replay_rejected: false,
      error: message,
    };
  }
}

export async function replayWindow(
  windowKey: string
): Promise<RiskResult> {
  const dummy: TelemetryFeatures = {
    mouse_speed_mean: 0,
    mouse_speed_std: 0,
    mouse_curvature: 0,
    scroll_speed_mean: 0,
    scroll_speed_std: 0,
    nav_flow_deviation: 0,
    keystroke_timing_mean: 0,
    keystroke_timing_std: 0,
    idle_ratio: 0,
    event_count: 0,
  };

  // Intentionally reuse the original key to test replay protection.
  return scoreWindow(dummy, windowKey, false);
}
