"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  GraphStats,
  GraphData,
  GraphNode,
  AdjacencyIndex,
  TimeRange,
  PipelineScorecard,
  PersonWorkload,
} from "../lib/types";
import { NODE_CONFIG } from "../lib/constants";
import { getMostConnected } from "../lib/graph-utils";

const TIME_RANGES: TimeRange[] = ["7d", "30d", "90d", "all"];

interface StatsBarProps {
  stats: GraphStats | null;
  graphData: GraphData;
  adjacency: AdjacencyIndex;
  loading: boolean;
  onNodeClick: (node: GraphNode) => void;
  onFocusNode: (node: GraphNode) => void;
  focusNodeId: string | null;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  scorecard: PipelineScorecard | null;
  workloads: PersonWorkload[];
}

/* ---- Helpers ---- */

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function rateColor(rate: number): string {
  if (rate >= 0.5) return "text-emerald-400";
  if (rate >= 0.25) return "text-amber-400";
  return "text-red-400";
}

function workloadColor(w: PersonWorkload): string {
  if (w.overdueTasks >= 3) return "text-red-400";
  if (w.openTasks >= 5 && w.taskCompletionRate < 0.3) return "text-amber-400";
  return "text-slate-300";
}

/* ---- Popup sub-components ---- */

function FunnelRow({ label, count, color, width }: { label: string; count: number; color: string; width: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-slate-400 w-16 text-right flex-shrink-0">{label}</span>
      <div className="flex-1 h-2.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} opacity-60 transition-all duration-500`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-xs text-slate-300 font-medium tabular-nums w-8">{count}</span>
    </div>
  );
}

function MetricCell({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="bg-white/5 rounded-lg px-2.5 py-1.5">
      <div className="text-[10px] text-slate-400 mb-0.5">{label}</div>
      <div className={`text-sm font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-[9px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function StatsBar({
  stats,
  graphData,
  adjacency,
  loading,
  onFocusNode,
  focusNodeId,
  timeRange,
  onTimeRangeChange,
  scorecard,
  workloads,
}: StatsBarProps) {
  const [hubOpen, setHubOpen] = useState(false);
  const [workloadOpen, setWorkloadOpen] = useState(false);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [pipelinePos, setPipelinePos] = useState({ top: 0, left: 0 });
  const hubRef = useRef<HTMLDivElement>(null);
  const pipelineBtnRef = useRef<HTMLButtonElement>(null);
  const pipelinePopupRef = useRef<HTMLDivElement>(null);

  const openPipeline = useCallback(() => {
    if (pipelineBtnRef.current) {
      const rect = pipelineBtnRef.current.getBoundingClientRect();
      setPipelinePos({ top: rect.bottom + 8, left: rect.left });
    }
    setPipelineOpen((v) => !v);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!hubOpen && !pipelineOpen) return;
    const handler = (e: MouseEvent) => {
      if (hubOpen && hubRef.current && !hubRef.current.contains(e.target as Node)) {
        setHubOpen(false);
      }
      if (pipelineOpen) {
        const clickedBtn = pipelineBtnRef.current?.contains(e.target as Node);
        const clickedPopup = pipelinePopupRef.current?.contains(e.target as Node);
        if (!clickedBtn && !clickedPopup) {
          setPipelineOpen(false);
        }
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [hubOpen, pipelineOpen]);

  const hub = useMemo(
    () => getMostConnected(adjacency, graphData),
    [adjacency, graphData],
  );

  // Determine displayed person: focused person takes priority over hub
  const displayedPerson = useMemo(() => {
    if (focusNodeId) {
      const focused = graphData.nodes.find((n) => n.id === focusNodeId);
      if (focused) return focused;
    }
    return hub;
  }, [focusNodeId, graphData.nodes, hub]);

  const displayedConnections = displayedPerson
    ? adjacency.get(displayedPerson.id)?.neighbors.size ?? 0
    : 0;

  // All person nodes sorted by connection count
  const personNodes = useMemo(() => {
    return graphData.nodes
      .filter((n) => n.type === "user" || n.type === "contact")
      .map((n) => ({
        node: n,
        connections: adjacency.get(n.id)?.neighbors.size ?? 0,
      }))
      .sort((a, b) => b.connections - a.connections);
  }, [graphData.nodes, adjacency]);

  if (loading && graphData.nodes.length === 0) {
    return (
      <div className="flex gap-3 px-4 py-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-8 w-24 bg-slate-800 rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const topWorkloads = workloads.slice(0, 6);

  return (
    <div className="px-4 py-2 border-b border-slate-800/50">
      {/* Single compact row: Org | Counts | Time | Pipeline metrics | Person focus */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Org + counts */}
        <span className="text-amber-400 font-semibold text-xs">
          {stats.orgName}
        </span>
        <span className="text-slate-600">|</span>
        <span className="text-blue-400 text-xs">
          {graphData.nodes.length.toLocaleString()} nodes
        </span>
        <span className="text-emerald-400 text-xs">
          {graphData.links.length.toLocaleString()} edges
        </span>

        {/* Time range pills */}
        <div className="flex items-center gap-0.5 bg-slate-800/50 rounded p-0.5">
          {TIME_RANGES.map((range) => (
            <button
              key={range}
              onClick={() => onTimeRangeChange(range)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded transition-all ${
                timeRange === range
                  ? "bg-blue-500/20 text-blue-400"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {range === "all" ? "All" : range}
            </button>
          ))}
        </div>

        {/* Pipeline summary (clickable → portal popup over graph) */}
        {scorecard && scorecard.totalMeetings > 0 && (
          <>
            <button
              ref={pipelineBtnRef}
              onClick={openPipeline}
              className="flex items-center gap-2 text-xs bg-slate-800/50 hover:bg-slate-700/50
                         rounded px-2.5 py-1 transition-colors"
            >
              <span className="text-rose-400">{scorecard.totalMeetings} Meetings</span>
              <span className="text-slate-600">&rarr;</span>
              <span className="text-yellow-400">{scorecard.totalInsights} Insights</span>
              <span className="text-slate-600">&rarr;</span>
              <span className="text-cyan-400">{scorecard.totalTasks} Tasks</span>
              {scorecard.overdueTasks > 0 && (
                <span className="text-[10px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded font-medium">
                  {scorecard.overdueTasks} overdue
                </span>
              )}
            </button>

            {/* Portal: renders over the graph canvas so backdrop-blur sees the graph */}
            {pipelineOpen && createPortal(
              <div
                ref={pipelinePopupRef}
                className="fixed z-[100] w-80
                           bg-white/[0.03] backdrop-blur-3xl backdrop-saturate-150
                           border border-white/[0.12] ring-1 ring-white/[0.06]
                           rounded-2xl shadow-2xl shadow-black/60 p-5"
                style={{ top: pipelinePos.top, left: pipelinePos.left }}
              >
                <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider mb-3">
                  Intelligence Pipeline
                </div>

                {/* Visual funnel */}
                <div className="space-y-2 mb-4">
                  <FunnelRow label="Meetings" count={scorecard.totalMeetings} color="bg-rose-400" width={100} />
                  <div className="flex items-center gap-2 pl-2">
                    <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7" />
                    </svg>
                    <span className={`text-[11px] font-medium ${rateColor(scorecard.meetingToInsightRate)}`}>
                      {pct(scorecard.meetingToInsightRate)} generated insights
                    </span>
                  </div>
                  <FunnelRow
                    label="Insights" count={scorecard.totalInsights} color="bg-yellow-400"
                    width={Math.max(30, (scorecard.totalInsights / Math.max(scorecard.totalMeetings, scorecard.totalInsights, scorecard.totalTasks)) * 100)}
                  />
                  <div className="flex items-center gap-2 pl-2">
                    <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7" />
                    </svg>
                    <span className={`text-[11px] font-medium ${rateColor(scorecard.insightToTaskRate)}`}>
                      {pct(scorecard.insightToTaskRate)} actioned into tasks
                    </span>
                  </div>
                  <FunnelRow
                    label="Tasks" count={scorecard.totalTasks} color="bg-cyan-400"
                    width={Math.max(20, (scorecard.totalTasks / Math.max(scorecard.totalMeetings, scorecard.totalInsights, scorecard.totalTasks)) * 100)}
                  />
                </div>

                {/* Key metrics grid */}
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/[0.08]">
                  <MetricCell
                    label="End-to-end yield"
                    value={pct(scorecard.endToEndYield)}
                    color={rateColor(scorecard.endToEndYield)}
                    sub="meetings → tasks"
                  />
                  <MetricCell
                    label="Task completion"
                    value={pct(scorecard.taskCompletionRate)}
                    color={rateColor(scorecard.taskCompletionRate)}
                  />
                  {scorecard.deadEndMeetings > 0 && (
                    <MetricCell
                      label="Dead-end meetings"
                      value={String(scorecard.deadEndMeetings)}
                      color="text-slate-400"
                      sub="zero insights produced"
                    />
                  )}
                  {scorecard.staleInsights > 0 && (
                    <MetricCell
                      label="Stale insights"
                      value={String(scorecard.staleInsights)}
                      color="text-amber-400"
                      sub="high-conf, no task, 30d+"
                    />
                  )}
                  {scorecard.overdueTasks > 0 && (
                    <MetricCell
                      label="Overdue tasks"
                      value={String(scorecard.overdueTasks)}
                      color="text-red-400"
                    />
                  )}
                </div>
              </div>,
              document.body,
            )}
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Person focus selector */}
        {hub && personNodes.length > 0 && (
          <div ref={hubRef} className="relative">
            <button
              onClick={() => setHubOpen(!hubOpen)}
              className="flex items-center gap-1.5 text-xs bg-slate-800/50 hover:bg-slate-700/50
                         rounded px-2 py-1 transition-colors"
            >
              <span className="text-[10px] text-slate-500">Focus:</span>
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: displayedPerson ? NODE_CONFIG[displayedPerson.type]?.color : undefined }}
              />
              <span className="text-slate-200 text-xs">{displayedPerson?.label}</span>
              <span className="text-slate-500 text-[10px]">({displayedConnections})</span>
              <svg
                className={`w-3 h-3 text-slate-500 transition-transform ${hubOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {hubOpen && (
              <div className="absolute top-full right-0 mt-1 z-50 bg-slate-800 border border-slate-700
                              rounded-lg shadow-xl max-h-64 overflow-y-auto min-w-[220px]">
                <div className="px-3 py-1.5 border-b border-slate-700">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                    Select person ({personNodes.length})
                  </span>
                </div>
                {personNodes.map(({ node, connections }) => (
                  <button
                    key={node.id}
                    onClick={() => {
                      onFocusNode(node);
                      setHubOpen(false);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 w-full text-left
                               hover:bg-slate-700/50 transition-colors"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: NODE_CONFIG[node.type]?.color }}
                    />
                    <span className="text-xs text-slate-300 truncate flex-1">
                      {node.label}
                    </span>
                    <span className="text-[10px] text-slate-500 tabular-nums">
                      {connections}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* People Workload (collapsible, compact) */}
      {topWorkloads.length > 0 && (
        <div className="mt-1.5">
          <button
            onClick={() => setWorkloadOpen(!workloadOpen)}
            className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            <svg
              className={`w-2.5 h-2.5 transition-transform ${workloadOpen ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="uppercase font-medium tracking-wider">People Workload</span>
            <span className="text-slate-600 normal-case font-normal">
              ({workloads.length})
            </span>
          </button>

          {workloadOpen && (
            <div className="mt-1.5 space-y-1">
              {/* Legend */}
              <div className="flex items-center gap-3 px-2 mb-1">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-1.5 rounded-sm bg-emerald-500/60" />
                  <span className="text-[9px] text-slate-500">Done</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-1.5 rounded-sm bg-blue-500/60" />
                  <span className="text-[9px] text-slate-500">Open</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-1.5 rounded-sm bg-red-500/60" />
                  <span className="text-[9px] text-slate-500">Overdue</span>
                </div>
              </div>

              {topWorkloads.map((w) => {
                const total = w.openTasks + w.completedTasks;
                const maxBar = Math.max(
                  ...topWorkloads.map((tw) => tw.openTasks + tw.completedTasks),
                  1,
                );
                const doneW = (w.completedTasks / maxBar) * 100;
                const openW = ((w.openTasks - w.overdueTasks) / maxBar) * 100;
                const overdueW = (w.overdueTasks / maxBar) * 100;

                return (
                  <button
                    key={w.nodeId}
                    onClick={() => {
                      const node = graphData.nodes.find((n) => n.id === w.nodeId);
                      if (node) onFocusNode(node);
                    }}
                    className="flex items-center gap-2 w-full text-left px-2 py-0.5 rounded
                               hover:bg-slate-800/50 transition-colors group"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: NODE_CONFIG[w.type]?.color }}
                    />
                    <span className={`text-[11px] truncate w-28 flex-shrink-0 group-hover:text-slate-100 ${workloadColor(w)}`}>
                      {w.label}
                    </span>

                    {/* Stacked bar: done (green) + open (blue) + overdue (red) */}
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
                      <div className="h-full bg-emerald-500/60" style={{ width: `${doneW}%` }} />
                      <div className="h-full bg-blue-500/60" style={{ width: `${openW}%` }} />
                      <div className="h-full bg-red-500/60" style={{ width: `${overdueW}%` }} />
                    </div>

                    {/* Clear readable counts */}
                    <div className="flex items-center gap-1.5 flex-shrink-0 text-[10px]">
                      <span className="text-slate-400 tabular-nums">
                        {w.completedTasks}/{total} done
                      </span>
                      {w.overdueTasks > 0 && (
                        <span className="text-red-400 bg-red-500/10 px-1 rounded tabular-nums">
                          {w.overdueTasks} overdue
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
              {workloads.length > 6 && (
                <div className="text-[10px] text-slate-600 px-2">
                  +{workloads.length - 6} more
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
