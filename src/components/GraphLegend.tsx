"use client";

import { useState } from "react";
import { EdgeType } from "@/lib/types";
import { EDGE_CONFIG } from "@/lib/constants";

interface GraphLegendProps {
  enabledEdgeTypes: Set<EdgeType>;
  onToggleEdgeType: (type: EdgeType) => void;
  hideOrphans: boolean;
  onToggleOrphans: () => void;
}

export default function GraphLegend({
  enabledEdgeTypes,
  onToggleEdgeType,
  hideOrphans,
  onToggleOrphans,
}: GraphLegendProps) {
  const allEdgeTypes = Object.entries(EDGE_CONFIG) as [EdgeType, (typeof EDGE_CONFIG)[EdgeType]][];
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? allEdgeTypes : allEdgeTypes.slice(0, 8);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Edge Types
        </h3>
        <div className="space-y-0.5">
          {visible.map(([type, cfg]) => {
            const enabled = enabledEdgeTypes.has(type);
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
                {!enabled && (
                  <span className="ml-auto text-[9px] text-slate-600">OFF</span>
                )}
              </button>
            );
          })}
        </div>
        {allEdgeTypes.length > 8 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-slate-600 hover:text-slate-400 mt-1 px-2 transition-colors"
          >
            {expanded
              ? "Show less"
              : `+${allEdgeTypes.length - 8} more`}
          </button>
        )}
      </div>

      {/* TODO: Orphan filter disabled — force-graph restarts simulation on node removal,
           causing layout collapse. Needs position-preserving approach. */}
    </div>
  );
}
