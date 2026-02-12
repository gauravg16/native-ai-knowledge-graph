"use client";

import { useMemo } from "react";
import { GraphStats, GraphData, GraphNode, AdjacencyIndex } from "@/lib/types";
import { NODE_CONFIG, ALL_NODE_TYPES } from "@/lib/constants";
import {
  getMostConnected,
  getIntelligenceChainStats,
} from "@/lib/graph-utils";

interface StatsBarProps {
  stats: GraphStats | null;
  graphData: GraphData;
  adjacency: AdjacencyIndex;
  loading: boolean;
  onNodeClick: (node: GraphNode) => void;
}

export default function StatsBar({
  stats,
  graphData,
  adjacency,
  loading,
  onNodeClick,
}: StatsBarProps) {
  const hub = useMemo(
    () => getMostConnected(adjacency, graphData),
    [adjacency, graphData],
  );

  const hubConnections = hub ? adjacency.get(hub.id)?.neighbors.size ?? 0 : 0;

  const chain = useMemo(
    () => getIntelligenceChainStats(graphData),
    [graphData],
  );

  if (loading && graphData.nodes.length === 0) {
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

  const maxCount = Math.max(
    ...ALL_NODE_TYPES.map((t) => stats.byType[t] || 0),
    1,
  );

  return (
    <div className="px-4 py-3 border-b border-slate-800/50 space-y-3">
      {/* Row 1: Summary + Intelligence Chain */}
      <div className="flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-4">
          <span className="text-amber-400 font-semibold text-sm">
            {stats.orgName}
          </span>
          <span className="text-slate-500 text-xs">|</span>
          <span className="text-blue-400 text-sm font-medium">
            {stats.totalNodes.toLocaleString()} nodes
          </span>
          <span className="text-slate-500 text-xs">|</span>
          <span className="text-emerald-400 text-sm font-medium">
            {stats.totalLinks.toLocaleString()} edges
          </span>
        </div>

        {/* Intelligence chain */}
        {chain.meetingCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs bg-slate-800/50 rounded-lg px-3 py-1.5">
            <span className="text-[10px] text-slate-500 uppercase mr-1">
              Pipeline:
            </span>
            <span className="text-rose-400 font-medium">
              {chain.meetingCount} Meetings
            </span>
            <span className="text-slate-600">&rarr;</span>
            <span className="text-yellow-400 font-medium">
              {chain.insightCount} Insights
            </span>
            <span className="text-slate-600">&rarr;</span>
            <span className="text-cyan-400 font-medium">
              {chain.taskCount} Tasks
            </span>
          </div>
        )}

        {/* Hub entity */}
        {hub && (
          <button
            onClick={() => onNodeClick(hub)}
            className="flex items-center gap-1.5 text-xs bg-slate-800/50 hover:bg-slate-700/50
                       rounded-lg px-3 py-1.5 transition-colors"
          >
            <span className="text-[10px] text-slate-500 uppercase">Hub:</span>
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: NODE_CONFIG[hub.type]?.color }}
            />
            <span className="text-slate-200 font-medium">{hub.label}</span>
            <span className="text-slate-500">({hubConnections})</span>
          </button>
        )}
      </div>

      {/* Row 2: Type breakdown bars */}
      <div className="flex gap-3 flex-wrap">
        {ALL_NODE_TYPES.filter((t) => (stats.byType[t] || 0) > 0).map(
          (type) => {
            const count = stats.byType[type] || 0;
            const pct = (count / maxCount) * 100;
            const cfg = NODE_CONFIG[type];

            return (
              <div key={type} className="flex items-center gap-1.5 min-w-[100px]">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cfg.color }}
                />
                <span className="text-[10px] text-slate-500 w-14">
                  {cfg.label}
                </span>
                <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: cfg.color,
                    }}
                  />
                </div>
                <span className="text-[10px] text-slate-400 tabular-nums w-6 text-right">
                  {count}
                </span>
              </div>
            );
          },
        )}
      </div>
    </div>
  );
}
