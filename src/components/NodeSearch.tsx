"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { GraphNode } from "@/lib/types";
import { NODE_CONFIG } from "@/lib/constants";
import { fuzzyMatchNodes } from "@/lib/graph-utils";

interface NodeSearchProps {
  nodes: GraphNode[];
  onSelectNode: (node: GraphNode) => void;
  onSearchChange: (results: GraphNode[]) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export default function NodeSearch({
  nodes,
  onSelectNode,
  onSearchChange,
  inputRef,
}: NodeSearchProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef || localRef;

  const results = useMemo(
    () => fuzzyMatchNodes(query, nodes),
    [query, nodes],
  );

  useEffect(() => {
    onSearchChange(results);
  }, [results, onSearchChange]);

  // Clear search highlights when query is cleared
  useEffect(() => {
    if (!query.trim()) {
      onSearchChange([]);
    }
  }, [query, onSearchChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        onSelectNode(results[selectedIndex]);
        setQuery("");
        setIsOpen(false);
      } else if (e.key === "Escape") {
        setQuery("");
        setIsOpen(false);
        ref.current?.blur();
      }
    },
    [results, selectedIndex, onSelectNode, ref],
  );

  return (
    <div className="relative">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          ref={ref}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setSelectedIndex(0);
          }}
          onFocus={() => query && setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder="Search nodes...  (/)"
          className="w-56 pl-9 pr-3 py-2 bg-slate-800 border border-slate-600 rounded-lg
                     text-sm text-slate-200 placeholder-slate-500
                     focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50
                     transition-all"
        />
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute top-full mt-1 w-72 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl z-50 max-h-72 overflow-y-auto">
          {results.map((node, i) => {
            const cfg = NODE_CONFIG[node.type];
            return (
              <button
                key={node.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelectNode(node);
                  setQuery("");
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors
                  ${i === selectedIndex ? "bg-slate-700" : "hover:bg-slate-700/50"}`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cfg.color }}
                />
                <span className="text-sm text-slate-200 truncate flex-1">
                  {node.label}
                </span>
                <span className="text-[10px] text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded">
                  {cfg.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
