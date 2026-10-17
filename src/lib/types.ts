export interface RiskEventRow {
  id: string;
  user_id: string;
  window_id: string | null;
  trust_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  confidence: number;
  reasons: string[];
  latency_ms: number;
  simulated: boolean;
  created_at: string;
}

export interface BehaviorWindowRow {
  id: string;
  user_id: string;
  window_key: string;
  features: Record<string, number>;
  trust_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  confidence: number;
  reasons: string[];
  latency_ms: number;
  simulated: boolean;
  used_for_baseline: boolean;
  created_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  status: "ACTIVE" | "STEP_UP_REQUIRED" | "REVOKED";
  revoked_at: string | null;
  last_score: number;
  last_risk_level: "LOW" | "MEDIUM" | "HIGH";
  last_confidence: number;
  last_latency_ms: number;
  updated_at: string;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  user_id: string;
  action: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface RiskResult {
  trust_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  confidence: number;
  reasons: string[];
  latency_ms: number;
  cold_start: boolean;
  simulated: boolean;
  session_status: "ACTIVE" | "STEP_UP_REQUIRED" | "REVOKED";
  replay_rejected: boolean;
  error?: string;
}

export interface TelemetryFeatures {
  mouse_speed_mean: number;
  mouse_speed_std: number;
  mouse_curvature: number;
  scroll_speed_mean: number;
  scroll_speed_std: number;
  nav_flow_deviation: number;
  keystroke_timing_mean: number;
  keystroke_timing_std: number;
  idle_ratio: number;
  event_count: number;
}
