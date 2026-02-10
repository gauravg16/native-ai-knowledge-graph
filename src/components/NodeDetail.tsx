"use client";

import { GraphNode } from "@/lib/types";
import { NODE_CONFIG } from "@/lib/constants";

interface NodeDetailProps {
  node: GraphNode | null;
  onClose: () => void;
}

export default function NodeDetail({ node, onClose }: NodeDetailProps) {
  if (!node) return null;

  const cfg = NODE_CONFIG[node.type];
  const props = node.properties || {};

  return (
    <div className="fixed top-0 right-0 h-full w-80 bg-slate-900 border-l border-slate-700 shadow-2xl z-50 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: cfg.color }}
            />
            <span className="text-xs font-medium text-slate-400 uppercase">
              {cfg.label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors text-lg"
          >
            &times;
          </button>
        </div>
        <h2 className="text-base font-semibold text-slate-100 mt-1 leading-tight">
          {node.label}
        </h2>
      </div>

      {/* Properties */}
      <div className="px-4 py-3 space-y-2">
        {Object.entries(props).map(([key, value]) => {
          if (value === null || value === undefined || value === "") return null;
          const display =
            typeof value === "object" ? JSON.stringify(value) : String(value);

          return (
            <div key={key} className="border-b border-slate-800 pb-2">
              <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                {key.replace(/_/g, " ")}
              </div>
              <div className="text-sm text-slate-300 break-words mt-0.5">
                {display}
              </div>
            </div>
          );
        })}
      </div>

      {/* Internal ID */}
      <div className="px-4 py-3 border-t border-slate-800">
        <div className="text-[10px] text-slate-600 font-mono">{node.id}</div>
      </div>
    </div>
  );
}
