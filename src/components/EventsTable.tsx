import type { RiskEventRow } from "@/lib/types";

interface EventsTableProps {
  events: RiskEventRow[];
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function riskBadge(level: string) {
  const map: Record<string, string> = {
    LOW: "text-green-400 bg-green-500/10 border-green-500/20",
    MEDIUM: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    HIGH: "text-red-400 bg-red-500/10 border-red-500/20",
  };
  return map[level] ?? map.LOW;
}

export function EventsTable({ events }: EventsTableProps) {
  if (events.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-sm text-slate-600">
        No risk events recorded yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
            <th className="px-2 py-2.5 font-medium">Time</th>
            <th className="px-2 py-2.5 font-medium">Score</th>
            <th className="px-2 py-2.5 font-medium">Risk</th>
            <th className="px-2 py-2.5 font-medium">Confidence</th>
            <th className="px-2 py-2.5 font-medium">Latency</th>
            <th className="px-2 py-2.5 font-medium">Reasons</th>
            <th className="px-2 py-2.5 font-medium">Type</th>
          </tr>
        </thead>
        <tbody>
          {events.slice(0, 20).map((e) => (
            <tr key={e.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition">
              <td className="px-2 py-3 text-slate-400 whitespace-nowrap">{formatTime(e.created_at)}</td>
              <td className="px-2 py-3 font-semibold text-white tabular-nums">{e.trust_score}</td>
              <td className="px-2 py-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${riskBadge(e.risk_level)}`}>
                  {e.risk_level}
                </span>
              </td>
              <td className="px-2 py-3 text-slate-400 tabular-nums">{(e.confidence * 100).toFixed(0)}%</td>
              <td className="px-2 py-3 text-slate-400 tabular-nums">{e.latency_ms}ms</td>
              <td className="px-2 py-3 text-slate-400 max-w-xs">
                <span className="line-clamp-2 text-xs">{e.reasons.join("; ")}</span>
              </td>
              <td className="px-2 py-3">
                {e.simulated ? (
                  <span className="text-xs font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                    SIMULATED
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">Live</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
