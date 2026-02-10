"use client";

import { NODE_CONFIG, EDGE_CONFIG } from "@/lib/constants";
import { ALL_NODE_TYPES } from "@/lib/constants";

export default function GraphLegend() {
  const edgeTypes = Object.entries(EDGE_CONFIG).slice(0, 6); // Show top 6

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Edge Types
        </h3>
        <div className="space-y-1">
          {edgeTypes.map(([type, cfg]) => (
            <div key={type} className="flex items-center gap-2 px-2 py-0.5">
              <span
                className="w-4 h-0.5 rounded flex-shrink-0"
                style={{ backgroundColor: cfg.color.replace(/[\d.]+\)$/, "1)") }}
              />
              <span className="text-xs text-slate-500">{cfg.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
