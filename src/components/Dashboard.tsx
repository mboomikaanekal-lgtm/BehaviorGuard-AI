import { useEffect, useRef, useState, useCallback } from "react";
import {
  ShieldCheck, ShieldAlert, Activity, Zap, AlertTriangle,
  RotateCcw, Bug, Repeat, Lock, Unlock, LogOut, Clock,
  TrendingUp, Gauge, Info, CheckCircle2, XCircle, AlertCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { BehaviorCollector } from "@/lib/behavior-collector";
import { scoreWindow, replayWindow } from "@/lib/risk-api";
import {
  fetchSession, fetchRiskEvents, fetchWindowCount,
  fetchRecentAlerts, resetDemoData, unlockSession,
} from "@/lib/dashboard-api";
import { supabase } from "@/lib/supabase";
import type { RiskEventRow, SessionRow, RiskResult } from "@/lib/types";
import { TrustGauge } from "@/components/TrustGauge";
import { StatCard } from "@/components/StatCard";
import { RiskChart } from "@/components/RiskChart";
import { EventsTable } from "@/components/EventsTable";

const WINDOW_INTERVAL = 15000; // 15s aggregation windows

export function Dashboard() {
  const { user, signOut } = useAuth();
  const collectorRef = useRef<BehaviorCollector | null>(null);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [events, setEvents] = useState<RiskEventRow[]>([]);
  const [eventCount, setEventCount] = useState(0);
  const [recentAlerts, setRecentAlerts] = useState<RiskEventRow[]>([]);
  const [lastResult, setLastResult] = useState<RiskResult | null>(null);
  const [toast, setToast] = useState<{ type: "info" | "error" | "success"; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const userId = user?.id ?? "";

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      setLoadError(null);
      const [sess, evts, count, alerts] = await Promise.all([
        fetchSession(userId),
        fetchRiskEvents(userId),
        fetchWindowCount(userId),
        fetchRecentAlerts(userId),
      ]);
      setSession(sess);
      setEvents(evts);
      setEventCount(count);
      setRecentAlerts(alerts);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load dashboard data");
    }
  }, [userId]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Start behavioral collector on the protected workspace
  useEffect(() => {
    const c = new BehaviorCollector();
    collectorRef.current = c;
    c.start();

    const windowTimer = setInterval(async () => {
      if (!collectorRef.current || session?.status === "REVOKED") return;
      const features = collectorRef.current.computeFeatures(WINDOW_INTERVAL);
      if (features.event_count < 5) return; // not enough activity to score
      const key = `win_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const result = await scoreWindow(features, key, false);
      setLastResult(result);
      if (result.error && !result.replay_rejected) {
        setToast({ type: "error", msg: result.error });
      }
      refresh();
    }, WINDOW_INTERVAL);

    return () => {
      clearInterval(windowTimer);
      c.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status]);

  const flashToast = (type: "info" | "error" | "success", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 5000);
  };

  const handleSimulateTakeover = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const features = BehaviorCollector.simulatedTakeoverFeatures();
      const key = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const result = await scoreWindow(features, key, true);
      setLastResult(result);
      if (result.error) {
        flashToast("error", result.error);
      } else {
        flashToast(
          result.risk_level === "HIGH" ? "error" : "info",
          `SIMULATED takeover: trust ${result.trust_score}, ${result.risk_level} — session ${result.session_status}`
        );
      }
      refresh();
    } catch (e) {
      flashToast("error", e instanceof Error ? e.message : "Simulation failed");
    }
    setBusy(false);
  };

  const handleReplayTest = async () => {
    if (busy || events.length === 0) {
      flashToast("info", "No windows available to replay yet");
      return;
    }
    setBusy(true);
    try {
      // Find the first window that has a corresponding behavior_windows row
      const recent = events[0];
      const { data: win } = await supabase
        .from("behavior_windows")
        .select("window_key")
        .eq("id", recent.window_id)
        .maybeSingle();
      if (!win?.window_key) {
        flashToast("info", "No replayable window found");
        setBusy(false);
        return;
      }
      const result = await replayWindow(win.window_key);
      if (result.replay_rejected) {
        flashToast("success", `Replay rejected: window ${win.window_key.slice(0, 16)}… was already processed`);
      } else if (result.error) {
        flashToast("error", result.error);
      } else {
        flashToast("info", "Replay was not rejected (unexpected)");
      }
      refresh();
    } catch (e) {
      flashToast("error", e instanceof Error ? e.message : "Replay test failed");
    }
    setBusy(false);
  };

  const handleReset = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await resetDemoData(userId);
      setLastResult(null);
      flashToast("success", "Demo data reset — baseline cleared, session active");
      refresh();
    } catch (e) {
      flashToast("error", e instanceof Error ? e.message : "Reset failed");
    }
    setBusy(false);
  };

  const handleStepUp = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await unlockSession(userId);
      flashToast("success", "Step-up verification complete — session restored to ACTIVE");
      refresh();
    } catch (e) {
      flashToast("error", e instanceof Error ? e.message : "Step-up failed");
    }
    setBusy(false);
  };

  const score = lastResult?.trust_score ?? session?.last_score ?? 100;
  const riskLevel = lastResult?.risk_level ?? session?.last_risk_level ?? "LOW";
  const confidence = lastResult?.confidence ?? session?.last_confidence ?? 0;
  const latency = lastResult?.latency_ms ?? session?.last_latency_ms ?? 0;
  const sessionStatus = session?.status ?? "ACTIVE";
  const coldStart = lastResult?.cold_start ?? false;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">BehaviorGuard AI</h1>
              <p className="text-xs text-slate-500">Live Account Takeover Detection</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-xs text-slate-500">{user?.email}</span>
            <button
              onClick={() => signOut()}
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition px-3 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Demo banner */}
        <div className="flex items-start gap-2 text-xs text-amber-300/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2.5">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong className="font-semibold">Demo prototype.</strong> Behavioral signals are collected in aggregate only
            — no passwords, typed text, or key values are recorded. Simulated data is clearly labeled.
          </span>
        </div>

        {loadError && (
          <div className="flex items-start gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Database error: {loadError}</span>
          </div>
        )}

        {toast && (
          <div className={`flex items-start gap-2 text-sm rounded-lg px-4 py-3 border ${
            toast.type === "error" ? "text-red-400 bg-red-500/10 border-red-500/20"
            : toast.type === "success" ? "text-green-400 bg-green-500/10 border-green-500/20"
            : "text-cyan-300 bg-cyan-500/10 border-cyan-500/20"
          }`}>
            {toast.type === "error" ? <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
            : toast.type === "success" ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            : <Info className="w-4 h-4 mt-0.5 shrink-0" />}
            <span>{toast.msg}</span>
          </div>
        )}

        {/* Session revoked banner */}
        {sessionStatus === "REVOKED" && (
          <div className="flex items-center justify-between gap-4 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-4">
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 text-red-400" />
              <div>
                <p className="font-semibold">Session Revoked</p>
                <p className="text-xs text-red-300/70">High-risk behavior detected — protected API requests are blocked.</p>
              </div>
            </div>
            <button
              onClick={handleReset}
              disabled={busy}
              className="text-xs font-medium text-red-300 hover:text-white border border-red-500/30 hover:bg-red-500/20 rounded-lg px-3 py-2 transition"
            >
              Reset Demo
            </button>
          </div>
        )}

        {/* Step-up banner */}
        {sessionStatus === "STEP_UP_REQUIRED" && (
          <div className="flex items-center justify-between gap-4 text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-5 py-4">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              <div>
                <p className="font-semibold">Step-Up Verification Required</p>
                <p className="text-xs text-amber-300/70">Medium-risk behavior detected — verify to continue.</p>
              </div>
            </div>
            <button
              onClick={handleStepUp}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs font-medium text-amber-300 hover:text-white border border-amber-500/30 hover:bg-amber-500/20 rounded-lg px-3 py-2 transition"
            >
              <Unlock className="w-3.5 h-3.5" />
              Verify
            </button>
          </div>
        )}

        {/* Top row: gauge + stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-1 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center">
            <TrustGauge score={score} riskLevel={riskLevel} />
            <div className="mt-4 flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-400">Confidence</span>
                <span className="text-sm font-semibold text-white">{(confidence * 100).toFixed(0)}%</span>
              </div>
              {coldStart && (
                <span className="text-xs text-cyan-400/70 bg-cyan-500/10 px-2 py-0.5 rounded-full">
                  Cold start — building baseline
                </span>
              )}
              {lastResult?.simulated && (
                <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full font-medium">
                  SIMULATED
                </span>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard
              icon={<Activity className="w-5 h-5" />}
              label="Session Status"
              value={sessionStatus}
              accent={sessionStatus === "ACTIVE" ? "green" : sessionStatus === "REVOKED" ? "red" : "amber"}
            />
            <StatCard
              icon={<Zap className="w-5 h-5" />}
              label="Events Processed"
              value={String(eventCount)}
              accent="cyan"
            />
            <StatCard
              icon={<Clock className="w-5 h-5" />}
              label="Scoring Latency"
              value={`${latency}ms`}
              accent="blue"
            />
            <StatCard
              icon={<AlertTriangle className="w-5 h-5" />}
              label="Recent Alerts"
              value={String(recentAlerts.length)}
              accent="amber"
            />
            <StatCard
              icon={<TrendingUp className="w-5 h-5" />}
              label="Risk Level"
              value={riskLevel}
              accent={riskLevel === "LOW" ? "green" : riskLevel === "HIGH" ? "red" : "amber"}
            />
            <StatCard
              icon={<ShieldCheck className="w-5 h-5" />}
              label="Trust Score"
              value={String(score)}
              accent={score >= 70 ? "green" : score >= 40 ? "amber" : "red"}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-300">Demo Controls</h2>
            <span className="text-xs text-slate-600">All actions persist to Supabase</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSimulateTakeover}
              disabled={busy}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              <Bug className="w-4 h-4" />
              Simulate Takeover
            </button>
            <button
              onClick={handleReplayTest}
              disabled={busy}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              <Repeat className="w-4 h-4" />
              Replay Test
            </button>
            <button
              onClick={handleReset}
              disabled={busy}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              Reset Demo
            </button>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-300">Trust Score History</h2>
            <span className="text-xs text-slate-600">From Supabase risk_events</span>
          </div>
          <RiskChart events={events} />
        </div>

        {/* Events table */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-300">Recent Risk Events</h2>
            <span className="text-xs text-slate-600">{events.length} total</span>
          </div>
          <EventsTable events={events} />
        </div>

        {/* Last result details */}
        {lastResult && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-3">Latest Risk Analysis</h2>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Trust Score</p>
                <p className="text-lg font-bold text-white">{lastResult.trust_score}/100</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Risk Level</p>
                <p className="text-lg font-bold text-white">{lastResult.risk_level}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Confidence</p>
                <p className="text-lg font-bold text-white">{(lastResult.confidence * 100).toFixed(0)}%</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Latency</p>
                <p className="text-lg font-bold text-white">{lastResult.latency_ms}ms</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-2">Risk Reasons</p>
              <ul className="space-y-1.5">
                {lastResult.reasons.map((r, i) => (
                  <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${
                      lastResult.risk_level === "HIGH" ? "bg-red-400"
                      : lastResult.risk_level === "MEDIUM" ? "bg-amber-400"
                      : "bg-green-400"
                    }`} />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <footer className="text-center text-xs text-slate-600 pt-4 pb-8">
          BehaviorGuard AI — Behavioral Biometrics Prototype · Powered by Supabase
        </footer>
      </main>
    </div>
  );
}
