import type { RiskEventRow } from "@/lib/types";

interface RiskChartProps {
  events: RiskEventRow[];
}

export function RiskChart({ events }: RiskChartProps) {
  if (events.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-slate-600">
        No risk events yet — interact with the workspace to generate behavioral data.
      </div>
    );
  }

  // Chronological order (oldest → newest) for the chart
  const sorted = [...events].reverse().slice(-40);
  const w = 800;
  const h = 200;
  const pad = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  const points = sorted.map((e, i) => ({
    x: pad.left + (sorted.length > 1 ? (i / (sorted.length - 1)) * chartW : chartW / 2),
    y: pad.top + (1 - e.trust_score / 100) * chartH,
    score: e.trust_score,
    simulated: e.simulated,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${pad.top + chartH} L ${points[0].x} ${pad.top + chartH} Z`;

  const color = (score: number) => score >= 70 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ minWidth: 500 }}>
        {/* grid lines */}
        {[0, 25, 50, 75, 100].map((v) => {
          const y = pad.top + (1 - v / 100) * chartH;
          return (
            <g key={v}>
              <line x1={pad.left} y1={y} x2={w - pad.right} y2={y} stroke="#1e293b" strokeWidth="1" />
              <text x={pad.left - 8} y={y + 4} fill="#475569" fontSize="10" textAnchor="end">{v}</text>
            </g>
          );
        })}
        {/* threshold lines */}
        <line x1={pad.left} y1={pad.top + 0.3 * chartH} x2={w - pad.right} y2={pad.top + 0.3 * chartH} stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 4" opacity="0.3" />
        <line x1={pad.left} y1={pad.top + 0.6 * chartH} x2={w - pad.right} y2={pad.top + 0.6 * chartH} stroke="#ef4444" strokeWidth="1" strokeDasharray="4 4" opacity="0.3" />

        {/* area */}
        <defs>
          <linearGradient id="trustGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#trustGrad)" />

        {/* line */}
        <path d={linePath} fill="none" stroke="#06b6d4" strokeWidth="2" />

        {/* points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={p.simulated ? 5 : 3.5}
            fill={color(p.score)}
            stroke={p.simulated ? "#f59e0b" : "#0f172a"}
            strokeWidth={p.simulated ? 2 : 1}
          >
            <title>{`Score: ${p.score}${p.simulated ? " (SIMULATED)" : ""}`}</title>
          </circle>
        ))}

        {/* x-axis label */}
        <text x={w / 2} y={h - 5} fill="#475569" fontSize="10" textAnchor="middle">
          Time (oldest → newest)
        </text>
      </svg>
    </div>
  );
}
