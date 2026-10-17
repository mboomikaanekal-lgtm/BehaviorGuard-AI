import { supabase } from "@/lib/supabase";
import type { RiskEventRow, SessionRow } from "@/lib/types";

export async function fetchSession(userId: string): Promise<SessionRow | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as SessionRow | null;
}

export async function fetchRiskEvents(userId: string, limit = 50): Promise<RiskEventRow[]> {
  const { data, error } = await supabase
    .from("risk_events")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as RiskEventRow[];
}

export async function fetchWindowCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("behavior_windows")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function fetchRecentAlerts(userId: string, limit = 5): Promise<RiskEventRow[]> {
  const { data, error } = await supabase
    .from("risk_events")
    .select("*")
    .eq("user_id", userId)
    .in("risk_level", ["MEDIUM", "HIGH"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as RiskEventRow[];
}

// Reset only the current demo user's data and session state.
export async function resetDemoData(userId: string): Promise<void> {
  const { error: wErr } = await supabase.from("behavior_windows").delete().eq("user_id", userId);
  if (wErr) throw new Error(wErr.message);
  const { error: eErr } = await supabase.from("risk_events").delete().eq("user_id", userId);
  if (eErr) throw new Error(eErr.message);
  const { error: sErr } = await supabase.from("sessions").delete().eq("user_id", userId);
  if (sErr) throw new Error(sErr.message);
  const { error: aErr } = await supabase.from("audit_logs").delete().eq("user_id", userId);
  if (aErr) throw new Error(aErr.message);
  const { error: pErr } = await supabase.from("profiles")
    .update({ baseline: {}, baseline_samples: 0, cold_start: true, last_updated: new Date().toISOString() })
    .eq("user_id", userId);
  if (pErr) throw new Error(pErr.message);
}

export async function unlockSession(userId: string): Promise<void> {
  const { error } = await supabase.from("sessions")
    .update({ status: "ACTIVE", revoked_at: null, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
