"use client";

import { useState, useRef, useCallback } from "react";
import { NodeType } from "../lib/types";
import { NODE_CONFIG, ALL_NODE_TYPES, VIEW_PRESETS } from "../lib/constants";

interface NodeTypeFilterProps {
  enabledTypes: Set<NodeType>;
  counts: Record<NodeType, number>;
  onToggle: (type: NodeType) => void;
  onSetTypes: (types: Set<NodeType>) => void;
}

export default function NodeTypeFilter({
  enabledTypes,
  counts,
  onToggle,
  onSetTypes,
}: NodeTypeFilterProps) {
  const [hoveredPreset, setHoveredPreset] = useState<string | null>(null);
  const [tooltipTop, setTooltipTop] = useState(0);
  const [tooltipLeft, setTooltipLeft] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const activePreset = Object.entries(VIEW_PRESETS).find(([, preset]) => {
    if (preset.types.length !== enabledTypes.size) return false;
    return preset.types.every((t) => enabledTypes.has(t));
  })?.[0] ?? null;

  const handleMouseEnter = useCallback(
    (key: string, e: React.MouseEvent<HTMLButtonElement>) => {
      setHoveredPreset(key);
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltipTop(rect.top);
      setTooltipLeft(rect.right + 12);
    },
    [],
  );

  return (
    <div className="space-y-3" ref={containerRef}>
      {/* View presets */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Views
        </h3>
        <div className="flex flex-col gap-1">
          {Object.entries(VIEW_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => onSetTypes(new Set(preset.types))}
              onMouseEnter={(e) => handleMouseEnter(key, e)}
              onMouseLeave={() => setHoveredPreset(null)}
              className={`w-full px-2.5 py-1.5 text-[11px] text-left rounded-md border transition-all ${
                activePreset === key
                  ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                  : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:bg-slate-700/50 hover:text-slate-300"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tooltip — fixed position, floats to the right of sidebar over the canvas */}
      {hoveredPreset && VIEW_PRESETS[hoveredPreset] && (
        <div
          className="fixed w-60 pointer-events-none rounded-xl overflow-hidden"
          style={{
            top: tooltipTop - 4,
            left: tooltipLeft,
            zIndex: 60,
            backgroundColor: '#1a2332',
            border: '1px solid rgba(148, 163, 184, 0.12)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45), 0 0 1px rgba(148, 163, 184, 0.1)',
          }}
        >
          <div style={{ padding: '14px 16px 12px' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', marginBottom: 6, letterSpacing: '0.01em' }}>
              {VIEW_PRESETS[hoveredPreset].label}
            </p>
            <p style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
              {VIEW_PRESETS[hoveredPreset].description}
            </p>
          </div>
          <div
            style={{
              padding: '8px 16px 10px',
              borderTop: '1px solid rgba(148, 163, 184, 0.08)',
              backgroundColor: 'rgba(15, 23, 42, 0.5)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px 10px',
            }}
          >
            {VIEW_PRESETS[hoveredPreset].types.map((t) => (
              <span
                key={t}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#64748b' }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: NODE_CONFIG[t]?.color,
                    flexShrink: 0,
                  }}
                />
                {NODE_CONFIG[t]?.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Individual type toggles */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Node Types
        </h3>
        <div className="space-y-0.5">
          {ALL_NODE_TYPES.map((type) => {
            const cfg = NODE_CONFIG[type];
            const count = counts[type] || 0;
            const enabled = enabledTypes.has(type);
            const isOrg = type === "organization";

            return (
              <button
                key={type}
                onClick={() => !isOrg && onToggle(type)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded w-full text-left transition-all ${
                  isOrg
                    ? "opacity-60 cursor-default"
                    : enabled
                      ? "hover:bg-slate-700/50"
                      : "opacity-40 hover:opacity-70 hover:bg-slate-800/30"
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0 transition-colors"
                  style={{ backgroundColor: enabled ? cfg.color : "#334155" }}
                />
                <span
                  className={`text-sm flex-1 transition-colors ${
                    enabled ? "text-slate-300" : "text-slate-500"
                  }`}
                >
                  {cfg.label}
                </span>
                {!isOrg && !enabled && (
                  <span className="text-[10px] text-slate-600 font-medium">+</span>
                )}
                {enabled && (
                  <span className="text-xs text-slate-500 tabular-nums">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
