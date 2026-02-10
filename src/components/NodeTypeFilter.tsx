"use client";

import { NodeType } from "@/lib/types";
import { NODE_CONFIG, ALL_NODE_TYPES } from "@/lib/constants";

interface NodeTypeFilterProps {
  enabledTypes: Set<NodeType>;
  counts: Record<NodeType, number>;
  onToggle: (type: NodeType) => void;
}

export default function NodeTypeFilter({
  enabledTypes,
  counts,
  onToggle,
}: NodeTypeFilterProps) {
  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
        Node Types
      </h3>
      {ALL_NODE_TYPES.map((type) => {
        const cfg = NODE_CONFIG[type];
        const count = counts[type] || 0;
        const enabled = enabledTypes.has(type);

        return (
          <label
            key={type}
            className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
              enabled
                ? "hover:bg-slate-700/50"
                : "opacity-40 hover:opacity-60"
            }`}
          >
            <input
              type="checkbox"
              checked={enabled}
              onChange={() => onToggle(type)}
              className="sr-only"
            />
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: enabled ? cfg.color : "#475569" }}
            />
            <span className="text-sm text-slate-300 flex-1">{cfg.label}</span>
            <span className="text-xs text-slate-500 tabular-nums">{count}</span>
          </label>
        );
      })}
    </div>
  );
}
