"use client";

import { useMemo } from "react";
import { GraphNode, NeighborInfo, EdgeType } from "@/lib/types";
import { NODE_CONFIG, EDGE_CONFIG } from "@/lib/constants";

interface NodeDetailProps {
  node: GraphNode | null;
  onClose: () => void;
  neighbors: NeighborInfo[];
  onNavigateToNode: (node: GraphNode) => void;
  onFocusNode: (node: GraphNode) => void;
}

export default function NodeDetail({
  node,
  onClose,
  neighbors,
  onNavigateToNode,
  onFocusNode,
}: NodeDetailProps) {
  const groupedNeighbors = useMemo(() => {
    const groups: Record<string, NeighborInfo[]> = {};
    for (const info of neighbors) {
      const edgeType = info.link.type;
      if (!groups[edgeType]) groups[edgeType] = [];
      groups[edgeType].push(info);
    }
    return groups;
  }, [neighbors]);

  if (!node) return null;

  const cfg = NODE_CONFIG[node.type];
  const props = node.properties || {};

  return (
    <div className="fixed top-0 right-0 h-full w-80 bg-slate-900 border-l border-slate-700 shadow-2xl z-50 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-4 py-3 z-10">
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => onFocusNode(node)}
              className="text-[10px] bg-blue-500/20 text-blue-300 hover:bg-blue-500/30
                         px-2 py-1 rounded transition-colors"
              title="Focus: highlight all connections"
            >
              Focus
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 transition-colors text-lg"
            >
              &times;
            </button>
          </div>
        </div>
        <h2 className="text-base font-semibold text-slate-100 mt-1 leading-tight">
          {node.label}
        </h2>
        {neighbors.length > 0 && (
          <div className="text-[10px] text-slate-500 mt-1">
            {neighbors.length} connection{neighbors.length !== 1 ? "s" : ""}
          </div>
        )}
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

      {/* Connections */}
      {neighbors.length > 0 && (
        <div className="px-4 py-3 border-t border-slate-700">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Connections
          </h3>

          {Object.entries(groupedNeighbors).map(([edgeType, items]) => {
            const edgeCfg = EDGE_CONFIG[edgeType as EdgeType];
            return (
              <div key={edgeType} className="mb-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className="w-3 h-0.5 rounded"
                    style={{
                      backgroundColor: edgeCfg?.color.replace(
                        /[\d.]+\)$/,
                        "1)",
                      ),
                    }}
                  />
                  <span className="text-[10px] font-medium text-slate-500 uppercase">
                    {edgeCfg?.label || edgeType}
                  </span>
                  <span className="text-[10px] text-slate-600">
                    ({items.length})
                  </span>
                </div>

                {items.map(({ node: neighbor, direction }) => {
                  const neighborCfg = NODE_CONFIG[neighbor.type];
                  return (
                    <button
                      key={`${edgeType}-${neighbor.id}-${direction}`}
                      onClick={() => onNavigateToNode(neighbor)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded
                                 hover:bg-slate-800 transition-colors text-left group"
                    >
                      <span className="text-xs text-slate-600 w-3 text-center">
                        {direction === "outgoing" ? "\u2192" : "\u2190"}
                      </span>
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: neighborCfg?.color }}
                      />
                      <span className="text-sm text-slate-300 truncate flex-1 group-hover:text-slate-100">
                        {neighbor.label}
                      </span>
                      <span className="text-[10px] text-slate-600">
                        {neighborCfg?.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Internal ID */}
      <div className="px-4 py-3 border-t border-slate-800">
        <div className="text-[10px] text-slate-600 font-mono">{node.id}</div>
      </div>
    </div>
  );
}
