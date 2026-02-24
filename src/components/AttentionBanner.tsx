"use client";

import { useState } from "react";
import { AttentionItem } from "../lib/types";

interface AttentionBannerProps {
  items: AttentionItem[];
  onHighlight: (nodeIds: string[]) => void;
}

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-400",
  warning: "bg-amber-400",
  info: "bg-blue-400",
};

const SEVERITY_TEXT: Record<string, string> = {
  critical: "text-red-300",
  warning: "text-amber-300",
  info: "text-blue-300",
};

export default function AttentionBanner({ items, onHighlight }: AttentionBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (items.length === 0 || dismissed) return null;

  const criticalCount = items.filter((i) => i.severity === "critical").length;
  const topItem = items[0];

  // Collapsed: single compact line
  if (!expanded) {
    return (
      <div className="px-4 py-1 border-b border-slate-800/50 bg-slate-900/40 flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${SEVERITY_DOT[topItem.severity]}`} />
        <span className={`text-xs flex-1 truncate ${SEVERITY_TEXT[topItem.severity]}`}>
          {topItem.message}
        </span>
        {items.length > 1 && (
          <button
            onClick={() => setExpanded(true)}
            className="text-[10px] text-slate-500 hover:text-slate-300 flex-shrink-0 transition-colors"
          >
            +{items.length - 1} more{criticalCount > 1 ? ` (${criticalCount} critical)` : ""}
          </button>
        )}
        {topItem.relatedNodeIds.length > 0 && (
          <button
            onClick={() => onHighlight(topItem.relatedNodeIds)}
            className="text-[10px] text-slate-500 hover:text-slate-200 bg-slate-800/50
                       hover:bg-slate-700/50 px-1.5 py-0.5 rounded transition-colors flex-shrink-0"
          >
            Show
          </button>
        )}
        <button
          onClick={() => setDismissed(true)}
          className="text-slate-600 hover:text-slate-400 transition-colors flex-shrink-0"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  // Expanded: full list
  return (
    <div className="px-4 py-1.5 border-b border-slate-800/50 bg-slate-900/40">
      <div className="space-y-0.5">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 px-1 py-0.5"
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${SEVERITY_DOT[item.severity]}`} />
            <span className="text-[10px] text-slate-500 w-16 flex-shrink-0 truncate">
              {item.category}
            </span>
            <span className={`text-xs flex-1 truncate ${SEVERITY_TEXT[item.severity]}`}>
              {item.message}
            </span>
            {item.relatedNodeIds.length > 0 && (
              <button
                onClick={() => onHighlight(item.relatedNodeIds)}
                className="text-[10px] text-slate-500 hover:text-slate-200 bg-slate-800/50
                           hover:bg-slate-700/50 px-1.5 py-0.5 rounded transition-colors flex-shrink-0"
              >
                Show
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-1">
        <button
          onClick={() => setExpanded(false)}
          className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
        >
          Collapse
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
        >
          Dismiss all
        </button>
      </div>
    </div>
  );
}
