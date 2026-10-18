
import type { ElementType } from "react";

interface StatCardProps {
  icon: ElementType;
  title: string;
  value: string;
  subtitle: string;
  color: "cyan" | "green" | "amber" | "red" | "blue";
}

const accentMap = {
  cyan: {
    text: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
  },
  green: {
    text: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
  },
  amber: {
    text: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  red: {
    text: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
  },
  blue: {
    text: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
};

export function StatCard({
  icon: Icon,
  title,
  value,
  subtitle,
  color,
}: StatCardProps) {
  const accent = accentMap[color] ?? accentMap.cyan;

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <div
        className={`w-9 h-9 rounded-lg ${accent.bg} ${accent.border} border flex items-center justify-center mb-3 ${accent.text}`}
      >
        <Icon className="w-5 h-5" />
      </div>

      <p className="text-xs text-slate-500 mb-0.5">{title}</p>

      <p className="text-lg font-bold text-white tracking-tight break-words">
        {value}
      </p>

      <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
    </div>
  );
}
