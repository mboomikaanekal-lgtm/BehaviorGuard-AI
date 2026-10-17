interface TrustGaugeProps {
  score: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
}

export function TrustGauge({ score, riskLevel }: TrustGaugeProps) {
  const radius = 80;
  const circumference = Math.PI * radius; // semicircle
  const dash = (score / 100) * circumference;

  const color = riskLevel === "LOW" ? "#22c55e" : riskLevel === "MEDIUM" ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative w-full max-w-[240px] flex flex-col items-center">
      <svg viewBox="0 0 200 120" className="w-full">
        {/* background arc */}
        <path
          d="M 20 110 A 80 80 0 0 1 180 110"
          fill="none"
          stroke="#1e293b"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* score arc */}
        <path
          d="M 20 110 A 80 80 0 0 1 180 110"
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: "stroke-dasharray 0.6s ease, stroke 0.3s ease" }}
        />
        {/* tick marks */}
        {[0, 25, 50, 75, 100].map((t) => {
          const angle = Math.PI - (t / 100) * Math.PI;
          const x1 = 100 + Math.cos(angle) * 72;
          const y1 = 110 - Math.sin(angle) * 72;
          const x2 = 100 + Math.cos(angle) * 65;
          const y2 = 110 - Math.sin(angle) * 65;
          return (
            <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#334155" strokeWidth="1.5" />
          );
        })}
      </svg>
      <div className="absolute bottom-0 flex flex-col items-center">
        <span className="text-4xl font-bold text-white tabular-nums">{score}</span>
        <span className="text-xs text-slate-500 -mt-1">/ 100</span>
        <span
          className="mt-1 text-xs font-semibold px-2.5 py-0.5 rounded-full"
          style={{ color, backgroundColor: `${color}20` }}
        >
          {riskLevel} RISK
        </span>
      </div>
    </div>
  );
}
