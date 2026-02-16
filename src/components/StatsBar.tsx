"use client";

import { useMemo } from "react";
import { GraphStats, GraphData, GraphNode, AdjacencyIndex, TimeRange } from "@/lib/types";
import { NODE_CONFIG, ALL_NODE_TYPES } from "@/lib/constants";
import {
  getMostConnected,
  getIntelligenceChainStats,
  computeActionableInsights,
} from "@/lib/graph-utils";

const TIME_RANGES: TimeRange[] = ["7d", "30d", "90d", "all"];

interface StatsBarProps {
  stats: GraphStats | null;
  graphData: GraphData;
  adjacency: AdjacencyIndex;
  loading: boolean;
  onNodeClick: (node: GraphNode) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}

export default function StatsBar({
  stats,
  graphData,
  adjacency,
  loading,
  onNodeClick,
  timeRange,
  onTimeRangeChange,
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

  const insights = useMemo(
    () => computeActionableInsights(graphData, adjacency),
    [graphData, adjacency],
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

  const insightItems: string[] = [];
  if (insights.topAssignee) {
    insightItems.push(
      `${insights.topAssignee.label} → ${insights.topAssignee.count} tasks (highest workload)`,
    );
  }
  if (insights.insightConcentration && insights.insightConcentration.percentage >= 50) {
    insightItems.push(
      `${insights.insightConcentration.topOwners} people own ${insights.insightConcentration.percentage}% of insights`,
    );
  }
  if (insights.unassignedTasks > 0) {
    insightItems.push(`${insights.unassignedTasks} tasks have no assignee`);
  }
  if (insights.disconnectedContacts > 0) {
    insightItems.push(
      `${insights.disconnectedContacts} contacts have 0 connections`,
    );
  }

  return (
    <div className="px-4 py-3 border-b border-slate-800/50 space-y-3">
      {/* Row 1: Summary + Time Range + Intelligence Chain */}
      <div className="flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-4">
          <span className="text-amber-400 font-semibold text-sm">
            {stats.orgName}
          </span>
          <span className="text-slate-500 text-xs">|</span>
          <span className="text-blue-400 text-sm font-medium">
            {graphData.nodes.length.toLocaleString()} nodes
          </span>
          <span className="text-slate-500 text-xs">|</span>
          <span className="text-emerald-400 text-sm font-medium">
            {graphData.links.length.toLocaleString()} edges
          </span>
        </div>

        {/* Time range pills */}
        <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-0.5">
          {TIME_RANGES.map((range) => (
            <button
              key={range}
              onClick={() => onTimeRangeChange(range)}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${
                timeRange === range
                  ? "bg-blue-500/20 text-blue-400"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {range === "all" ? "All" : range}
            </button>
          ))}
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

      {/* Row 3: Actionable Insights */}
      {insightItems.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">
            Insights:
          </span>
          {insightItems.map((item, i) => (
            <span key={i} className="text-[11px] text-slate-400">
              <span className="text-slate-600 mr-1">&bull;</span>
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
