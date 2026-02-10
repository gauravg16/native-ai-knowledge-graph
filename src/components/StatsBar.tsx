"use client";

import { GraphStats } from "@/lib/types";

interface StatsBarProps {
  stats: GraphStats | null;
  loading: boolean;
}

export default function StatsBar({ stats, loading }: StatsBarProps) {
  if (loading) {
    return (
      <div className="flex gap-3 px-4 py-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-12 w-28 bg-slate-800 rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    { label: "Nodes", value: stats.totalNodes, color: "text-blue-400" },
    { label: "Edges", value: stats.totalLinks, color: "text-emerald-400" },
    {
      label: "Organization",
      value: stats.orgName,
      color: "text-amber-400",
      isText: true,
    },
  ];

  return (
    <div className="flex gap-3 px-4 py-3 flex-wrap">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-4 py-2 min-w-[100px]"
        >
          <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
            {card.label}
          </div>
          <div className={`text-lg font-semibold ${card.color}`}>
            {card.isText
              ? card.value
              : (card.value as number).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
