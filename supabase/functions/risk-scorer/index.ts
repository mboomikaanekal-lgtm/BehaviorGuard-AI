// BehaviorGuard AI — Deterministic server-side risk engine
// Edge Function: /functions/v1/risk-scorer
// Validates telemetry, enforces session revocation, rejects replayed windows,
// computes an explainable trust score, persists results, and updates the
// user's behavioral baseline from low-risk observations only.
// Never trusts client-supplied scores, user IDs, or session status.

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TelemetryFeatures {
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

interface RiskResult {
  trust_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  confidence: number;
  reasons: string[];
  latency_ms: number;
  cold_start: boolean;
}

interface Baseline {
  mouse_speed_mean: number;
  mouse_speed_std: number;
  mouse_curvature: number;
  scroll_speed_mean: number;
  scroll_speed_std: number;
  nav_flow_deviation: number;
  keystroke_timing_mean: number;
  keystroke_timing_std: number;
  idle_ratio: number;
  samples: number;
}

// Population-level defaults representing typical human interaction patterns.
// Used during cold-start (before a personal baseline is established) so that
// extreme anomalies (e.g. simulated takeover) can still be flagged.
const DEFAULT_BASELINE: Baseline = {
  mouse_speed_mean: 450,
  mouse_speed_std: 200,
  mouse_curvature: 0.75,
  scroll_speed_mean: 800,
  scroll_speed_std: 400,
  nav_flow_deviation: 0.15,
  keystroke_timing_mean: 180,
  keystroke_timing_std: 90,
  idle_ratio: 0.35,
  samples: 0,
};

function validateFeatures(raw: unknown): TelemetryFeatures | null {
  if (typeof raw !== "object" || raw === null) return null;
  const f = raw as Record<string, unknown>;
  const n = (v: unknown): number | null =>
    typeof v === "number" && isFinite(v) ? v : null;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  const mouse_speed_mean = n(f.mouse_speed_mean);
  const mouse_speed_std = n(f.mouse_speed_std);
  const mouse_curvature = n(f.mouse_curvature);
  const scroll_speed_mean = n(f.scroll_speed_mean);
  const scroll_speed_std = n(f.scroll_speed_std);
  const nav_flow_deviation = n(f.nav_flow_deviation);
  const keystroke_timing_mean = n(f.keystroke_timing_mean);
  const keystroke_timing_std = n(f.keystroke_timing_std);
  const idle_ratio = n(f.idle_ratio);
  const event_count = n(f.event_count);

  if (
    mouse_speed_mean === null || mouse_speed_std === null ||
    mouse_curvature === null || scroll_speed_mean === null ||
    scroll_speed_std === null || nav_flow_deviation === null ||
    keystroke_timing_mean === null || keystroke_timing_std === null ||
    idle_ratio === null || event_count === null
  ) {
    return null;
  }
  if (event_count < 0 || event_count > 100000) return null;

  return {
    mouse_speed_mean: Math.max(0, mouse_speed_mean),
    mouse_speed_std: Math.max(0, mouse_speed_std),
    mouse_curvature: clamp01(mouse_curvature),
    scroll_speed_mean: Math.max(0, scroll_speed_mean),
    scroll_speed_std: Math.max(0, scroll_speed_std),
    nav_flow_deviation: clamp01(nav_flow_deviation),
    keystroke_timing_mean: Math.max(0, keystroke_timing_mean),
    keystroke_timing_std: Math.max(0, keystroke_timing_std),
    idle_ratio: clamp01(idle_ratio),
    event_count: Math.floor(event_count),
  };
}

// Computes a trust score 0..100 by measuring deviation from the behavioral
// baseline. Each reason corresponds to a contributing penalty. Deterministic.
function scoreWindow(f: TelemetryFeatures, baseline: Baseline, isColdStart: boolean): RiskResult {
  const t0 = performance.now();
  const reasons: string[] = [];
  let penalty = 0;

  // Use personal baseline if enough samples; fall back to population defaults.
  const b = isColdStart ? DEFAULT_BASELINE : baseline;

  const relDev = (obs: number, base: number, std: number): number => {
    const denom = std > 0 ? std : Math.max(Math.abs(base) * 0.25, 1e-6);
    return Math.abs(obs - base) / denom;
  };

  // Mouse movement deviation
  const mouseSpeedDev = relDev(f.mouse_speed_mean, b.mouse_speed_mean, b.mouse_speed_std);
  if (mouseSpeedDev > 3) {
    const p = Math.min(30, (mouseSpeedDev - 3) * 6);
    penalty += p;
    reasons.push(`Mouse speed deviates ${mouseSpeedDev.toFixed(1)}σ from ${isColdStart ? "population" : "baseline"} (+${p.toFixed(0)})`);
  }

  const mouseCurvDev = Math.abs(f.mouse_curvature - b.mouse_curvature) / 0.15;
  if (mouseCurvDev > 2.5) {
    const p = Math.min(20, (mouseCurvDev - 2.5) * 5);
    penalty += p;
    reasons.push(`Mouse trajectory curvature anomaly (+${p.toFixed(0)})`);
  }

  // Scroll pattern deviation
  const scrollDev = relDev(f.scroll_speed_mean, b.scroll_speed_mean, b.scroll_speed_std);
  if (scrollDev > 3.5) {
    const p = Math.min(15, (scrollDev - 3.5) * 4);
    penalty += p;
    reasons.push(`Scroll cadence deviation ${scrollDev.toFixed(1)}σ (+${p.toFixed(0)})`);
  }

  // Navigation-flow deviation
  if (f.nav_flow_deviation > 0.6) {
    const p = Math.min(25, (f.nav_flow_deviation - 0.6) * 50);
    penalty += p;
    reasons.push(`Navigation flow anomaly: ${(f.nav_flow_deviation * 100).toFixed(0)}% unexpected transitions (+${p.toFixed(0)})`);
  }

  // Keystroke timing deviation
  const ksDev = relDev(f.keystroke_timing_mean, b.keystroke_timing_mean, b.keystroke_timing_std);
  if (ksDev > 3) {
    const p = Math.min(25, (ksDev - 3) * 5);
    penalty += p;
    reasons.push(`Keystroke cadence deviation ${ksDev.toFixed(1)}σ (+${p.toFixed(0)})`);
  }

  // Keystroke uniformity — bots have unnaturally low variance
  if (f.keystroke_timing_mean > 0 && f.keystroke_timing_std > 0) {
    const cv = f.keystroke_timing_std / f.keystroke_timing_mean;
    if (cv < 0.1 && f.event_count > 20) {
      penalty += 18;
      reasons.push(`Keystroke timing unnaturally uniform (CV=${cv.toFixed(2)}) — possible automation (+18)`);
    }
  }

  // Idle ratio — bots/automation often have extreme idle patterns
  if (f.idle_ratio > 0.85) {
    const p = Math.min(15, (f.idle_ratio - 0.85) * 100);
    penalty += p;
    reasons.push(`Excessive idle ratio ${(f.idle_ratio * 100).toFixed(0)}% — possible automation (+${p.toFixed(0)})`);
  }
  if (f.idle_ratio < 0.02 && f.event_count > 40) {
    penalty += 12;
    reasons.push(`Suspiciously continuous activity with no pauses — possible automation (+12)`);
  }

  const trust_score = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  let risk_level: "LOW" | "MEDIUM" | "HIGH";
  if (trust_score >= 70) risk_level = "LOW";
  else if (trust_score >= 40) risk_level = "MEDIUM";
  else risk_level = "HIGH";

  // confidence grows with baseline samples; shrinks with extreme penalty
  const baseConf = Math.min(0.95, 0.4 + baseline.samples * 0.03);
  const confidence = Math.max(0.1, baseConf - penalty / 200);

  if (reasons.length === 0) {
    if (isColdStart) {
      reasons.push("Behavioral signals within expected population range (cold start — personal baseline building)");
    } else {
      reasons.push("Behavioral signals within expected baseline range");
    }
  }

  return {
    trust_score,
    risk_level,
    confidence: Math.round(confidence * 100) / 100,
    reasons,
    latency_ms: Math.round(performance.now() - t0),
    cold_start: isColdStart,
  };
}

// Exponential moving average baseline update, only from low-risk non-simulated
// observations. First observation seeds the baseline directly.
function updateBaseline(prev: Baseline, f: TelemetryFeatures): Baseline {
  if (prev.samples === 0) {
    return {
      mouse_speed_mean: f.mouse_speed_mean,
      mouse_speed_std: f.mouse_speed_std,
      mouse_curvature: f.mouse_curvature,
      scroll_speed_mean: f.scroll_speed_mean,
      scroll_speed_std: f.scroll_speed_std,
      nav_flow_deviation: f.nav_flow_deviation,
      keystroke_timing_mean: f.keystroke_timing_mean,
      keystroke_timing_std: f.keystroke_timing_std,
      idle_ratio: f.idle_ratio,
      samples: 1,
    };
  }
  const a = 0.3;
  const blend = (o: number, b: number) => a * o + (1 - a) * b;
  return {
    mouse_speed_mean: blend(f.mouse_speed_mean, prev.mouse_speed_mean),
    mouse_speed_std: blend(f.mouse_speed_std, prev.mouse_speed_std),
    mouse_curvature: blend(f.mouse_curvature, prev.mouse_curvature),
    scroll_speed_mean: blend(f.scroll_speed_mean, prev.scroll_speed_mean),
    scroll_speed_std: blend(f.scroll_speed_std, prev.scroll_speed_std),
    nav_flow_deviation: blend(f.nav_flow_deviation, prev.nav_flow_deviation),
    keystroke_timing_mean: blend(f.keystroke_timing_mean, prev.keystroke_timing_mean),
    keystroke_timing_std: blend(f.keystroke_timing_std, prev.keystroke_timing_std),
    idle_ratio: blend(f.idle_ratio, prev.idle_ratio),
    samples: prev.samples + 1,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // Authenticate via the caller's JWT — extract user id server-side.
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return jsonResponse({ error: "Missing authorization token" }, 401);

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) {
      return jsonResponse({ error: "Invalid or expired session" }, 401);
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { window_key, features, simulated } = body as {
      window_key?: unknown; features?: unknown; simulated?: unknown;
    };

    if (typeof window_key !== "string" || window_key.length < 4 || window_key.length > 128) {
      return jsonResponse({ error: "Invalid or missing window_key" }, 400);
    }
    const isSimulated = simulated === true;
    const validated = validateFeatures(features);
    if (!validated) {
      return jsonResponse({ error: "Invalid telemetry features" }, 400);
    }

    // ---- session revocation gate ----
    const { data: session } = await supabase
      .from("sessions").select("status").eq("user_id", userId).maybeSingle();
    if (session?.status === "REVOKED") {
      await supabase.from("audit_logs").insert({
        user_id: userId,
        action: "blocked_revoked_session",
        detail: { window_key, reason: "Session is REVOKED — request blocked" },
      });
      return jsonResponse({
        error: "Session has been revoked due to high risk. Protected requests are blocked.",
        session_status: "REVOKED",
      }, 403);
    }

    // ---- replay / idempotency rejection ----
    const { error: insertErr } = await supabase
      .from("behavior_windows").insert({
        user_id: userId,
        window_key,
        features: validated as unknown as Record<string, unknown>,
        simulated: isSimulated,
      });

    if (insertErr) {
      if (insertErr.code === "23505") {
        await supabase.from("audit_logs").insert({
          user_id: userId,
          action: "replay_rejected",
          detail: { window_key, reason: "Duplicate window_key — replay rejected" },
        });
        return jsonResponse({
          error: "Replay rejected: this telemetry window was already processed.",
          replay_rejected: true,
          window_key,
        }, 409);
      }
      return jsonResponse({ error: "Failed to persist telemetry window: " + insertErr.message }, 500);
    }

    // ---- load profile / baseline ----
    const { data: profile } = await supabase
      .from("profiles").select("baseline, baseline_samples, cold_start")
      .eq("user_id", userId).maybeSingle();

    const prevBaseline: Baseline = profile?.baseline
      ? { ...DEFAULT_BASELINE, ...(profile.baseline as Partial<Baseline>), samples: profile.baseline_samples ?? 0 }
      : { ...DEFAULT_BASELINE, samples: 0 };

    const isColdStart = prevBaseline.samples < 3;

    // ---- compute risk (always — even during cold start, using population defaults) ----
    const result = scoreWindow(validated, prevBaseline, isColdStart);

    // ---- update behavior_windows with risk result ----
    const { data: updatedWindow } = await supabase
      .from("behavior_windows")
      .update({
        trust_score: result.trust_score,
        risk_level: result.risk_level,
        confidence: result.confidence,
        reasons: result.reasons,
        latency_ms: result.latency_ms,
      })
      .eq("user_id", userId).eq("window_key", window_key)
      .select("id").maybeSingle();

    // ---- insert risk_event ----
    const { data: eventRow } = await supabase.from("risk_events").insert({
      user_id: userId,
      window_id: updatedWindow?.id ?? null,
      trust_score: result.trust_score,
      risk_level: result.risk_level,
      confidence: result.confidence,
      reasons: result.reasons,
      latency_ms: result.latency_ms,
      simulated: isSimulated,
    }).select("id").maybeSingle();

    // ---- update session ----
    const newStatus = result.risk_level === "HIGH" ? "REVOKED"
      : result.risk_level === "MEDIUM" ? "STEP_UP_REQUIRED" : "ACTIVE";
    await supabase.from("sessions").upsert({
      user_id: userId,
      status: newStatus,
      revoked_at: newStatus === "REVOKED" ? new Date().toISOString() : null,
      last_score: result.trust_score,
      last_risk_level: result.risk_level,
      last_confidence: result.confidence,
      last_latency_ms: result.latency_ms,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    // ---- baseline update (low-risk, non-simulated only — never from simulated takeover) ----
    let usedForBaseline = false;
    if (!isSimulated && result.risk_level === "LOW") {
      const newBaseline = updateBaseline(prevBaseline, validated);
      await supabase.from("profiles").upsert({
        user_id: userId,
        baseline: newBaseline as unknown as Record<string, unknown>,
        baseline_samples: newBaseline.samples,
        cold_start: newBaseline.samples < 3,
        last_updated: new Date().toISOString(),
      }, { onConflict: "user_id" });
      usedForBaseline = true;
    } else if (!profile) {
      await supabase.from("profiles").upsert({
        user_id: userId,
        baseline: prevBaseline as unknown as Record<string, unknown>,
        baseline_samples: prevBaseline.samples,
        cold_start: true,
        last_updated: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }
    if (usedForBaseline) {
      await supabase.from("behavior_windows")
        .update({ used_for_baseline: true })
        .eq("user_id", userId).eq("window_key", window_key);
    }

    // ---- audit ----
    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "risk_scored",
      detail: {
        window_key,
        trust_score: result.trust_score,
        risk_level: result.risk_level,
        confidence: result.confidence,
        latency_ms: result.latency_ms,
        simulated: isSimulated,
        session_action: newStatus,
        event_id: eventRow?.id ?? null,
      },
    });

    return jsonResponse({
      trust_score: result.trust_score,
      risk_level: result.risk_level,
      confidence: result.confidence,
      reasons: result.reasons,
      latency_ms: result.latency_ms,
      cold_start: result.cold_start,
      simulated: isSimulated,
      session_status: newStatus,
      replay_rejected: false,
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message ?? "Internal server error" }, 500);
  }
});
