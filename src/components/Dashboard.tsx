"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  NodeType,
  GraphNode,
  GraphResponse,
  OrgSummary,
  GraphData,
} from "@/lib/types";
import { DEFAULT_ENABLED_TYPES, ALL_NODE_TYPES } from "@/lib/constants";
import GraphCanvas from "./GraphCanvas";
import OrgSelector from "./OrgSelector";
import NodeTypeFilter from "./NodeTypeFilter";
import StatsBar from "./StatsBar";
import NodeDetail from "./NodeDetail";
import GraphLegend from "./GraphLegend";

const EMPTY_GRAPH: GraphData = { nodes: [], links: [] };

export default function Dashboard() {
  const [organizations, setOrganizations] = useState<OrgSummary[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [enabledTypes, setEnabledTypes] = useState<Set<NodeType>>(
    new Set(DEFAULT_ENABLED_TYPES),
  );
  const [graphResponse, setGraphResponse] = useState<GraphResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Measure container
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Fetch organizations on mount
  useEffect(() => {
    fetch("/api/organizations")
      .then((r) => r.json())
      .then((data: OrgSummary[]) => {
        setOrganizations(data);
        if (data.length > 0) {
          setSelectedOrgId(data[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setOrgsLoading(false));
  }, []);

  // Fetch graph data when org or types change
  const fetchGraph = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const types = Array.from(enabledTypes).join(",");
      const res = await fetch(
        `/api/graph?org_id=${selectedOrgId}&types=${types}`,
      );
      const data: GraphResponse = await res.json();
      setGraphResponse(data);
      setSelectedNode(null);
    } catch (err) {
      console.error("Failed to fetch graph:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, enabledTypes]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  const handleToggleType = (type: NodeType) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        // Don't allow disabling organization
        if (type === "organization") return prev;
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const stats = graphResponse?.stats || null;
  const graphData = graphResponse?.data || EMPTY_GRAPH;

  const counts = stats?.byType || ({} as Record<NodeType, number>);

  return (
    <div className="flex flex-col h-screen bg-slate-950">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="5" r="2" strokeWidth="2" />
              <circle cx="5" cy="19" r="2" strokeWidth="2" />
              <circle cx="19" cy="19" r="2" strokeWidth="2" />
              <path strokeWidth="2" d="M12 7v5m-5.5 3.5L11 14m7.5 1.5L13 14" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-100">
              Native AI Knowledge Graph
            </h1>
            <p className="text-[10px] text-slate-500">
              Supabase &rarr; Interactive Graph Visualization
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {orgsLoading ? (
            <div className="h-9 w-48 bg-slate-800 rounded-lg animate-pulse" />
          ) : (
            <OrgSelector
              organizations={organizations}
              selectedId={selectedOrgId}
              onChange={setSelectedOrgId}
            />
          )}
          <button
            onClick={fetchGraph}
            disabled={loading}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-600 transition-colors disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </header>

      {/* Stats Bar */}
      <StatsBar stats={stats} loading={loading} />

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-52 bg-slate-900/50 border-r border-slate-800 p-3 overflow-y-auto flex-shrink-0">
          <NodeTypeFilter
            enabledTypes={enabledTypes}
            counts={counts}
            onToggle={handleToggleType}
          />
          <div className="mt-4 pt-3 border-t border-slate-800">
            <GraphLegend />
          </div>
        </aside>

        {/* Graph canvas */}
        <main ref={containerRef} className="flex-1 relative">
          {loading && graphData.nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-slate-400">Loading graph data...</p>
              </div>
            </div>
          ) : graphData.nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-slate-500">
                Select an organization to visualize its knowledge graph
              </p>
            </div>
          ) : (
            <GraphCanvas
              graphData={graphData}
              onNodeClick={setSelectedNode}
              width={dimensions.width}
              height={dimensions.height}
            />
          )}

          {/* Fetched timestamp */}
          {graphResponse?.fetchedAt && (
            <div className="absolute bottom-3 left-3 text-[10px] text-slate-600">
              Live from Supabase &middot;{" "}
              {new Date(graphResponse.fetchedAt).toLocaleTimeString()}
            </div>
          )}
        </main>
      </div>

      {/* Node detail panel */}
      <NodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} />
    </div>
  );
}
