
import { useEffect, useRef, useState, useCallback } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Activity,
  Zap,
  AlertTriangle,
  Bug,
  Lock,
  Unlock,
  LogOut,
  Clock,
  TrendingUp,
  Gauge,
  Info,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { BehaviorCollector } from "@/lib/behavior-collector";
import { scoreWindow } from "@/lib/risk-api";
import {
  fetchSession,
  fetchRiskEvents,
  fetchWindowCount,
  fetchRecentAlerts,
  unlockSession,
} from "@/lib/dashboard-api";
import type {
  RiskEventRow,
  SessionRow,
  RiskResult,
} from "@/lib/types";
import { TrustGauge } from "@/components/TrustGauge";
import { StatCard } from "@/components/StatCard";
import { RiskChart } from "@/components/RiskChart";
import { EventsTable } from "@/components/EventsTable";

export function Dashboard() {
  const { user, signOut } = useAuth();

  const [session, setSession] = useState<SessionRow | null>(null);
  const [events, setEvents] = useState<RiskEventRow[]>([]);
  const [windowCount, setWindowCount] = useState(0);
  const [recentAlerts, setRecentAlerts] = useState(0);
  const [lastResult, setLastResult] = useState<RiskResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const collectorRef = useRef<BehaviorCollector | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [sessionData, eventData, count, alerts] = await Promise.all([
        fetchSession(),
        fetchRiskEvents(),
        fetchWindowCount(),
        fetchRecentAlerts(),
      ]);

      setSession(sessionData);
      setEvents(eventData);
      setWindowCount(count);
      setRecentAlerts(alerts);
    } catch (error) {
      console.error("Failed to refresh dashboard:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const interval = window.setInterval(() => {
      void refresh();
    }, 10000);

    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const collector = new BehaviorCollector(async (features, windowKey) => {
      try {
        const result = await scoreWindow(features, windowKey);
        setLastResult(result);
        await refresh();
      } catch (error) {
        console.error("Failed to score behavioral window:", error);
      }
    });

    collectorRef.current = collector;
    collector.start();

    return () => {
      collector.stop();
      collectorRef.current = null;
    };
  }, [refresh]);

  const handleSimulateTakeover = async () => {
    if (busy) return;

    setBusy(true);

    try {
      const collector = collectorRef.current;

      if (collector) {
        collector.simulateTakeover();
      }

      await refresh();
    } catch (error) {
      console.error("Failed to simulate takeover:", error);
    } finally {
      setBusy(false);
    }
  };

  const handleStepUp = async () => {
    if (busy) return;

    setBusy(true);

    try {
      await unlockSession();
      await refresh();
    } catch (error) {
      console.error("Step-up verification failed:", error);
    } finally {
      setBusy(false);
    }
  };

  const trustScore = session?.last_score ?? 100;
  const riskLevel =
    trustScore < 40 ? "HIGH" : trustScore < 70 ? "MEDIUM" : "LOW";

  const sessionStatus = session?.status ?? "ACTIVE";

  const riskLevelStyles = {
    LOW: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    MEDIUM: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    HIGH: "text-red-400 bg-red-400/10 border-red-400/20",
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <ShieldCheck className="w-12 h-12 text-cyan-400 animate-pulse" />
          <p className="text-slate-400 text-sm">
            Loading BehaviorGuard AI...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-cyan-400" />
            </div>

            <div>
              <h1 className="font-bold text-lg tracking-tight">
                BehaviorGuard <span className="text-cyan-400">AI</span>
              </h1>
              <p className="text-xs text-slate-500">
                Behavioral Account Protection
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <p className="text-sm text-slate-300">
                {user?.email ?? "User"}
              </p>
              <p className="text-xs text-slate-500">Authenticated session</p>
            </div>

            <button
              onClick={signOut}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition text-sm"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Security Dashboard</h2>
            <p className="text-slate-400 text-sm mt-1">
              Real-time behavioral monitoring and risk assessment
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            Monitoring active
          </div>
        </div>

        {sessionStatus === "REVOKED" && (
          <div className="flex items-start gap-4 p-5 rounded-2xl bg-red-500/10 border border-red-500/30">
            <ShieldAlert className="w-6 h-6 text-red-400 shrink-0" />
            <div>
              <h3 className="font-semibold text-red-300">
                Session Revoked
              </h3>
              <p className="text-sm text-red-200/70 mt-1">
                This session has been revoked because of detected risk.
                Contact your administrator or follow your application's
                recovery process to restore access.
              </p>
            </div>
          </div>
        )}

        {sessionStatus === "STEP_UP_REQUIRED" && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-start gap-3">
              <Lock className="w-6 h-6 text-amber-400 shrink-0" />
              <div>
                <h3 className="font-semibold text-amber-300">
                  Additional Verification Required
                </h3>
                <p className="text-sm text-amber-200/70 mt-1">
                  Your behavioral risk score requires additional verification.
                </p>
              </div>
            </div>

            <button
              onClick={handleStepUp}
              disabled={busy}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              <Unlock className="w-4 h-4" />
              Verify
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center">
            <div className="flex items-center justify-between w-full mb-6">
              <h3 className="text-sm font-semibold text-slate-300">
                Trust Score
              </h3>
              <Gauge className="w-5 h-5 text-cyan-400" />
            </div>

            <TrustGauge score={trustScore} />

            <div
              className={`mt-5 px-3 py-1 rounded-full border text-xs font-semibold ${riskLevelStyles[riskLevel]}`}
            >
              {riskLevel} RISK
            </div>

            <p className="text-xs text-slate-500 text-center mt-4">
              Based on recent behavioral activity
            </p>
          </div>

          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard
              title="Trust Score"
              value={trustScore.toFixed(1)}
              subtitle="Current session"
              icon={ShieldCheck}
              color="cyan"
            />

            <StatCard
              title="Risk Events"
              value={events.length.toString()}
              subtitle="Recorded events"
              icon={AlertTriangle}
              color="red"
            />

            <StatCard
              title="Behavior Windows"
              value={windowCount.toString()}
              subtitle="Collected windows"
              icon={Activity}
              color="blue"
            />

            <StatCard
              title="Recent Alerts"
              value={recentAlerts.toString()}
              subtitle="Elevated risk events"
              icon={Zap}
              color="amber"
            />
          </div>
        </div>

        {/* Demo Controls */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4 gap-3">
            <h2 className="text-sm font-semibold text-slate-300">
              Demo Controls
            </h2>
            <span className="text-xs text-slate-500">
              Behavioral risk simulation
            </span>
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
          </div>
        </div>

        {lastResult && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              {lastResult.risk_level === "LOW" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : lastResult.risk_level === "MEDIUM" ? (
                <AlertCircle className="w-5 h-5 text-amber-400" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400" />
              )}

              <h2 className="text-sm font-semibold text-slate-300">
                Latest Risk Assessment
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-slate-500">Trust score</p>
                <p className="text-xl font-bold mt-1">
                  {lastResult.trust_score.toFixed(1)}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">Risk level</p>
                <p className="text-xl font-bold mt-1">
                  {lastResult.risk_level}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">Latency</p>
                <p className="text-xl font-bold mt-1">
                  {lastResult.latency_ms.toFixed(1)} ms
                </p>
              </div>
            </div>

            {lastResult.reasons?.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-slate-500 mb-2">
                  Assessment reasons
                </p>
                <ul className="space-y-1">
                  {lastResult.reasons.map((reason, index) => (
                    <li
                      key={`${reason}-${index}`}
                      className="text-sm text-slate-400 flex items-start gap-2"
                    >
                      <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5 gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-300">
                Trust Score History
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Recent behavioral risk assessments
              </p>
            </div>
            <TrendingUp className="w-5 h-5 text-cyan-400" />
          </div>

          <RiskChart events={events} />
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5 gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-300">
                Risk Events
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Latest recorded behavioral events
              </p>
            </div>
            <Clock className="w-5 h-5 text-slate-500" />
          </div>

          <EventsTable events={events} />
        </div>

        <footer className="text-center text-xs text-slate-600 pb-4">
          BehaviorGuard AI · Behavioral monitoring demo
        </footer>
      </main>
    </div>
  );
}
