import type { ReactNode } from "react";

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  accent: "cyan" | "green" | "amber" | "red" | "blue";
}

const accentMap = {
  cyan: { text: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20" },
  green: { text: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20" },
  amber: { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  red: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
  blue: { text: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
};

export function StatCard({ icon, label, value, accent }: StatCardProps) {
  const a = accentMap[accent];
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <div className={`w-9 h-9 rounded-lg ${a.bg} ${a.border} border flex items-center justify-center mb-3 ${a.text}`}>
        {icon}
      </div>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className="text-lg font-bold text-white tracking-tight break-words">{value}</p>
    </div>
  );
}
