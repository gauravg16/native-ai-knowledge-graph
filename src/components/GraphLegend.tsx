"use client";

import { useState } from "react";
import { EdgeType } from "../lib/types";
import { EDGE_CONFIG } from "../lib/constants";

interface GraphLegendProps {
  enabledEdgeTypes: Set<EdgeType>;
  onToggleEdgeType: (type: EdgeType) => void;
  hideOrphans: boolean;
  onToggleOrphans: () => void;
  edgeCounts: Record<EdgeType, number>;
}

export default function GraphLegend({
  enabledEdgeTypes,
  onToggleEdgeType,
  edgeCounts,
}: GraphLegendProps) {
  const allEdgeTypes = Object.entries(EDGE_CONFIG) as [EdgeType, (typeof EDGE_CONFIG)[EdgeType]][];
  // Only show edge types that have at least 1 edge in the current data
  const populatedEdgeTypes = allEdgeTypes.filter(([type]) => (edgeCounts[type] ?? 0) > 0);
  const [expanded, setExpanded] = useState(false);
  const INITIAL_SHOW = 8;
  const visible = expanded ? populatedEdgeTypes : populatedEdgeTypes.slice(0, INITIAL_SHOW);

  if (populatedEdgeTypes.length === 0) {
    return (
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Edge Types
        </h3>
        <p className="text-[10px] text-slate-600 px-2">No edges in current view</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Edge Types
        </h3>
        <div className="space-y-0.5">
          {visible.map(([type, cfg]) => {
            const enabled = enabledEdgeTypes.has(type);
            const count = edgeCounts[type] ?? 0;
            return (
              <button
                key={type}
                onClick={() => onToggleEdgeType(type)}
                className={`flex items-center gap-2 px-2 py-1 w-full rounded text-left transition-all ${
                  enabled
                    ? "hover:bg-slate-800/50"
                    : "opacity-35 hover:opacity-60"
                }`}
              >
                <span
                  className="w-4 h-0.5 rounded flex-shrink-0 transition-opacity"
                  style={{
                    backgroundColor: cfg.color.replace(/[\d.]+\)$/, "1)"),
                  }}
                />
                <span className="text-xs text-slate-500">{cfg.label}</span>
                <span className="ml-auto text-[9px] text-slate-600 tabular-nums">
                  {enabled ? count : "OFF"}
                </span>
              </button>
            );
          })}
        </div>
        {populatedEdgeTypes.length > INITIAL_SHOW && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-slate-600 hover:text-slate-400 mt-1 px-2 transition-colors"
          >
            {expanded
              ? "Show less"
              : `+${populatedEdgeTypes.length - INITIAL_SHOW} more`}
          </button>
        )}
      </div>
    </div>
  );
}
