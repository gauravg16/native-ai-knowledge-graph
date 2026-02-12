"use client";

import { useState } from "react";
import { EDGE_CONFIG } from "@/lib/constants";

export default function GraphLegend() {
  const allEdgeTypes = Object.entries(EDGE_CONFIG);
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? allEdgeTypes : allEdgeTypes.slice(0, 8);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Edge Types
        </h3>
        <div className="space-y-1">
          {visible.map(([type, cfg]) => (
            <div key={type} className="flex items-center gap-2 px-2 py-0.5">
              <span
                className="w-4 h-0.5 rounded flex-shrink-0"
                style={{
                  backgroundColor: cfg.color.replace(/[\d.]+\)$/, "1)"),
                }}
              />
              <span className="text-xs text-slate-500">{cfg.label}</span>
            </div>
          ))}
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
    </div>
  );
}
