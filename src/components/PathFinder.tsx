"use client";

import { GraphNode } from "../lib/types";
import { NODE_CONFIG } from "../lib/constants";

interface PathFinderProps {
  isActive: boolean;
  startNode: GraphNode | null;
  endNode: GraphNode | null;
  pathLength: number | null;
  onActivate: () => void;
  onDeactivate: () => void;
  onClearStart: () => void;
  onClearEnd: () => void;
  onSwap: () => void;
}

function NodeChip({
  node,
  onClear,
}: {
  node: GraphNode;
  onClear: () => void;
}) {
  const cfg = NODE_CONFIG[node.type];
  return (
    <span className="inline-flex items-center gap-1.5 bg-slate-700 rounded-md px-2 py-1">
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: cfg.color }}
      />
      <span className="text-xs text-slate-200 max-w-[100px] truncate">
        {node.label}
      </span>
      <button
        onClick={onClear}
        className="text-slate-400 hover:text-white text-xs ml-0.5"
      >
        &times;
      </button>
    </span>
  );
}

export default function PathFinder({
  isActive,
  startNode,
  endNode,
  pathLength,
  onActivate,
  onDeactivate,
  onClearStart,
  onClearEnd,
  onSwap,
}: PathFinderProps) {
  if (!isActive) {
    return (
      <button
        onClick={onActivate}
        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs
                   rounded-lg border border-slate-600 transition-colors flex items-center gap-2"
        title="Find shortest path between two nodes"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
          />
        </svg>
        Find Path
      </button>
    );
  }

  return (
    <div
      className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2
                    flex items-center gap-3 flex-wrap"
    >
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-xs text-amber-300 font-medium">Path Finder</span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-slate-500 uppercase">From:</span>
        {startNode ? (
          <NodeChip node={startNode} onClear={onClearStart} />
        ) : (
          <span className="text-xs text-slate-500 italic">
            click a node...
          </span>
        )}
      </div>

      <button
        onClick={onSwap}
        className="text-slate-500 hover:text-white transition-colors text-sm"
        title="Swap start and end"
      >
        &#x21C4;
      </button>

      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-slate-500 uppercase">To:</span>
        {endNode ? (
          <NodeChip node={endNode} onClear={onClearEnd} />
        ) : (
          <span className="text-xs text-slate-500 italic">
            click a node...
          </span>
        )}
      </div>

      {startNode && endNode && pathLength !== null && pathLength > 0 && (
        <span className="text-xs text-amber-200 bg-amber-500/20 px-2 py-0.5 rounded-md font-medium">
          {pathLength === 1 ? "1 hop" : `${pathLength} hops`}
        </span>
      )}
      {startNode && endNode && pathLength === null && (
        <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-md">
          No path
        </span>
      )}

      <button
        onClick={onDeactivate}
        className="text-xs text-slate-500 hover:text-white ml-auto transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
