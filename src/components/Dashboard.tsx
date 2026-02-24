"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  NodeType,
  EdgeType,
  GraphNode,
  GraphResponse,
  OrgSummary,
  GraphData,
  InteractionMode,
  FocusState,
  PathState,
  TimeRange,
} from "../lib/types";
import { DEFAULT_ENABLED_TYPES, EDGE_CONFIG } from "../lib/constants";
import {
  getNeighbors,
  bfsShortestPath,
  getLinkKey,
  applyGraphFilters,
  computePipelineScorecard,
  computePersonWorkloads,
  computeAttentionQueue,
  computeNodeAnalytics,
} from "../lib/graph-utils";
import GraphCanvas, { GraphCanvasHandle } from "./GraphCanvas";
import OrgSelector from "./OrgSelector";
import NodeTypeFilter from "./NodeTypeFilter";
import StatsBar from "./StatsBar";
import NodeDetail from "./NodeDetail";
import GraphLegend from "./GraphLegend";
import NodeSearch from "./NodeSearch";
import PathFinder from "./PathFinder";
import AttentionBanner from "./AttentionBanner";

const EMPTY_GRAPH: GraphData = { nodes: [], links: [] };
const EMPTY_PATH: PathState = {
  startNodeId: null,
  endNodeId: null,
  path: null,
  pathLinkKeys: new Set(),
};

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

  // V1 state
  const [mode, setMode] = useState<InteractionMode>("explore");
  const [focusState, setFocusState] = useState<FocusState | null>(null);
  const [pathState, setPathState] = useState<PathState>(EMPTY_PATH);
  const [searchResults, setSearchResults] = useState<GraphNode[]>([]);
  const [attentionHighlightCount, setAttentionHighlightCount] = useState(0);

  // V2 filter state
  const [enabledEdgeTypes, setEnabledEdgeTypes] = useState<Set<EdgeType>>(
    () => new Set(Object.keys(EDGE_CONFIG) as EdgeType[]),
  );
  const [hideOrphans, setHideOrphans] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<GraphCanvasHandle>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const rawGraphData = graphResponse?.data || EMPTY_GRAPH;
  const stats = graphResponse?.stats || null;
  const counts = stats?.byType || ({} as Record<NodeType, number>);

  // V2 filter pipeline: time → edge types → orphans → dynamic sizing → adjacency
  const { data: graphData, adjacency: adjacencyIndex } = useMemo(
    () => applyGraphFilters(rawGraphData, { enabledEdgeTypes, hideOrphans, timeRange }),
    [rawGraphData, enabledEdgeTypes, hideOrphans, timeRange],
  );

  // Compute filtered edge counts for dynamic legend
  const filteredEdgeCounts = useMemo(() => {
    const counts = {} as Record<EdgeType, number>;
    for (const et of Object.keys(EDGE_CONFIG) as EdgeType[]) counts[et] = 0;
    for (const link of graphData.links) {
      const t = typeof link.type === "string" ? link.type as EdgeType : undefined;
      if (t && t in EDGE_CONFIG) counts[t]++;
    }
    return counts;
  }, [graphData.links]);

  // V3 analytics: pipeline scorecard + workloads + attention queue
  const scorecard = useMemo(
    () => computePipelineScorecard(graphData, adjacencyIndex),
    [graphData, adjacencyIndex],
  );

  const workloads = useMemo(
    () => computePersonWorkloads(graphData, adjacencyIndex),
    [graphData, adjacencyIndex],
  );

  const attentionItems = useMemo(
    () => computeAttentionQueue(graphData, adjacencyIndex, scorecard, workloads),
    [graphData, adjacencyIndex, scorecard, workloads],
  );

  // Compute neighbors for selected node
  const selectedNodeNeighbors = useMemo(
    () =>
      selectedNode
        ? getNeighbors(selectedNode.id, graphData, adjacencyIndex)
        : [],
    [selectedNode, graphData, adjacencyIndex],
  );

  // Node analytics for selected node
  const selectedNodeAnalytics = useMemo(
    () =>
      selectedNode
        ? computeNodeAnalytics(selectedNode, graphData, adjacencyIndex, workloads)
        : null,
    [selectedNode, graphData, adjacencyIndex, workloads],
  );

  // Search highlight IDs
  const searchHighlightIds = useMemo(
    () => new Set(searchResults.map((n) => n.id)),
    [searchResults],
  );

  // Path nodes for PathFinder display
  const pathStartNode = useMemo(
    () =>
      pathState.startNodeId
        ? graphData.nodes.find((n) => n.id === pathState.startNodeId) || null
        : null,
    [pathState.startNodeId, graphData.nodes],
  );
  const pathEndNode = useMemo(
    () =>
      pathState.endNodeId
        ? graphData.nodes.find((n) => n.id === pathState.endNodeId) || null
        : null,
    [pathState.endNodeId, graphData.nodes],
  );
  const pathLength = useMemo(() => {
    if (!pathState.startNodeId || !pathState.endNodeId) return undefined;
    if (pathState.path === null) return null; // no path found
    return pathState.path.length - 1; // hops = nodes - 1
  }, [pathState]);

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
      setFocusState(null);
      setPathState(EMPTY_PATH);
      setMode("explore");
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
        if (type === "organization") return prev;
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const handleToggleEdgeType = useCallback((type: EdgeType) => {
    setEnabledEdgeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  // --- Focus Mode ---

  const handleNodeFocus = useCallback(
    (node: GraphNode) => {
      const entry = adjacencyIndex.get(node.id);
      if (!entry) return;

      const linkKeys = new Set<string>();
      for (const link of entry.links) {
        linkKeys.add(getLinkKey(link));
      }

      setFocusState({
        nodeId: node.id,
        neighborIds: new Set(entry.neighbors),
        linkKeys,
      });
      setMode("focus");
      setSelectedNode(node);
      setPathState(EMPTY_PATH);
      graphRef.current?.centerOnNode(node, 3);
    },
    [adjacencyIndex],
  );

  const handleExitFocus = useCallback(() => {
    setFocusState(null);
    setMode("explore");
  }, []);

  const handleNodeDoubleClick = useCallback(
    (node: GraphNode) => {
      handleNodeFocus(node);
    },
    [handleNodeFocus],
  );

  // --- Path Finding ---

  const handlePathActivate = useCallback(() => {
    setMode("pathfinding");
    setPathState(EMPTY_PATH);
    setFocusState(null);
  }, []);

  const handlePathDeactivate = useCallback(() => {
    setMode("explore");
    setPathState(EMPTY_PATH);
  }, []);

  const handleNodeClickInPathMode = useCallback(
    (node: GraphNode) => {
      setPathState((prev) => {
        if (!prev.startNodeId) {
          return { ...prev, startNodeId: node.id };
        } else if (!prev.endNodeId) {
          const path = bfsShortestPath(
            prev.startNodeId,
            node.id,
            adjacencyIndex,
          );
          const pathLinkKeys = new Set<string>();
          if (path) {
            for (let i = 0; i < path.length - 1; i++) {
              pathLinkKeys.add(`${path[i]}__${path[i + 1]}`);
              pathLinkKeys.add(`${path[i + 1]}__${path[i]}`);
            }
          }
          return {
            startNodeId: prev.startNodeId,
            endNodeId: node.id,
            path: path,
            pathLinkKeys,
          };
        }
        return prev;
      });
      setSelectedNode(node);
    },
    [adjacencyIndex],
  );

  // --- Unified Node Click ---

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      if (mode === "pathfinding") {
        handleNodeClickInPathMode(node);
      } else {
        setSelectedNode(node);
      }
    },
    [mode, handleNodeClickInPathMode],
  );

  // --- Navigate to Node (from detail panel) ---

  const handleNavigateToNode = useCallback((node: GraphNode) => {
    setSelectedNode(node);
    graphRef.current?.centerOnNode(node, 3);
  }, []);

  const handleNavigateToNodeId = useCallback(
    (nodeId: string) => {
      const node = graphData.nodes.find((n) => n.id === nodeId);
      if (node) handleNavigateToNode(node);
    },
    [graphData.nodes, handleNavigateToNode],
  );

  // --- Search ---

  const handleSearchSelect = useCallback((node: GraphNode) => {
    setSelectedNode(node);
    setSearchResults([]);
    graphRef.current?.centerOnNode(node, 3);
  }, []);

  const handleSearchChange = useCallback((results: GraphNode[]) => {
    setSearchResults(results);
  }, []);

  // --- Keyboard Shortcuts ---

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (attentionHighlightCount > 0) {
          setSearchResults([]);
          setAttentionHighlightCount(0);
        } else if (mode === "focus") {
          handleExitFocus();
        } else if (mode === "pathfinding") {
          handlePathDeactivate();
        } else {
          setSelectedNode(null);
        }
      }
      if (
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !(e.target instanceof HTMLInputElement)
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, handleExitFocus, handlePathDeactivate, attentionHighlightCount]);

  return (
    <div className="relative flex flex-col h-screen bg-slate-950">
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
              <path
                strokeWidth="2"
                d="M12 7v5m-5.5 3.5L11 14m7.5 1.5L13 14"
              />
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
          <NodeSearch
            nodes={graphData.nodes}
            onSelectNode={handleSearchSelect}
            onSearchChange={handleSearchChange}
            inputRef={searchInputRef}
          />
          {orgsLoading ? (
            <div className="h-9 w-48 bg-slate-800 rounded-lg animate-pulse" />
          ) : (
            <OrgSelector
              organizations={organizations}
              selectedId={selectedOrgId}
              onChange={setSelectedOrgId}
            />
          )}
          <PathFinder
            isActive={mode === "pathfinding"}
            startNode={pathStartNode}
            endNode={pathEndNode}
            pathLength={pathLength ?? null}
            onActivate={handlePathActivate}
            onDeactivate={handlePathDeactivate}
            onClearStart={() =>
              setPathState(EMPTY_PATH)
            }
            onClearEnd={() =>
              setPathState((prev) => ({
                ...prev,
                endNodeId: null,
                path: null,
                pathLinkKeys: new Set(),
              }))
            }
            onSwap={() =>
              setPathState((prev) => ({
                startNodeId: prev.endNodeId,
                endNodeId: prev.startNodeId,
                path: prev.path ? [...prev.path].reverse() : null,
                pathLinkKeys: prev.pathLinkKeys,
              }))
            }
          />
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
      <StatsBar
        stats={stats}
        graphData={graphData}
        adjacency={adjacencyIndex}
        loading={loading}
        onNodeClick={handleNavigateToNode}
        onFocusNode={handleNodeFocus}
        focusNodeId={focusState?.nodeId ?? null}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        scorecard={scorecard}
        workloads={workloads}
      />

      {/* Attention Banner */}
      <AttentionBanner
        items={attentionItems}
        onHighlight={(nodeIds) => {
          const nodes = graphData.nodes.filter((n) => new Set(nodeIds).has(n.id));
          setSearchResults(nodes);
          setAttentionHighlightCount(nodes.length);
        }}
      />

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-52 bg-slate-900/50 border-r border-slate-800 p-3 overflow-y-auto flex-shrink-0">
          <NodeTypeFilter
            enabledTypes={enabledTypes}
            counts={counts}
            onToggle={handleToggleType}
            onSetTypes={setEnabledTypes}
          />
          <div className="mt-4 pt-3 border-t border-slate-800">
            <GraphLegend
              enabledEdgeTypes={enabledEdgeTypes}
              onToggleEdgeType={handleToggleEdgeType}
              hideOrphans={hideOrphans}
              onToggleOrphans={() => setHideOrphans((v) => !v)}
              edgeCounts={filteredEdgeCounts}
            />
          </div>
        </aside>

        {/* Graph canvas */}
        <main ref={containerRef} className="flex-1 relative">
          {/* Focus mode banner */}
          {mode === "focus" && focusState && (
            <div
              className="absolute top-3 left-1/2 -translate-x-1/2 z-30
                          bg-blue-500/15 border border-blue-500/30 rounded-lg px-4 py-2
                          flex items-center gap-3 backdrop-blur-sm"
            >
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-xs text-blue-200">
                Focus Mode &mdash; double-click another node or press ESC to
                exit
              </span>
              <button
                onClick={handleExitFocus}
                className="text-xs text-blue-400 hover:text-white ml-2 transition-colors"
              >
                Exit
              </button>
            </div>
          )}

          {/* Pathfinding banner */}
          {mode === "pathfinding" && (
            <div
              className="absolute top-3 left-1/2 -translate-x-1/2 z-30
                          bg-amber-500/15 border border-amber-500/30 rounded-lg px-4 py-2
                          flex items-center gap-3 backdrop-blur-sm"
            >
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-xs text-amber-200">
                {!pathState.startNodeId
                  ? "Click a start node..."
                  : !pathState.endNodeId
                    ? "Now click a destination node..."
                    : "Path found! Press ESC to exit"}
              </span>
            </div>
          )}

          {loading && graphData.nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-slate-400">
                  Loading graph data...
                </p>
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
              ref={graphRef}
              graphData={graphData}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={handleNodeDoubleClick}
              onBackgroundClick={
                mode === "focus" ? handleExitFocus : undefined
              }
              focusState={focusState}
              pathState={pathState}
              searchHighlightIds={searchHighlightIds}
              width={dimensions.width}
              height={dimensions.height}
            />
          )}

          {/* Attention highlight clear chip */}
          {attentionHighlightCount > 0 && searchHighlightIds.size > 0 && (
            <div
              className="absolute top-3 right-3 z-30
                          bg-slate-800/90 border border-slate-600 rounded-lg px-3 py-1.5
                          flex items-center gap-2 backdrop-blur-sm"
            >
              <span className="text-xs text-slate-300">
                {attentionHighlightCount} nodes highlighted
              </span>
              <button
                onClick={() => {
                  setSearchResults([]);
                  setAttentionHighlightCount(0);
                }}
                className="text-xs text-slate-400 hover:text-white bg-slate-700 hover:bg-slate-600
                           px-2 py-0.5 rounded transition-colors"
              >
                Clear
              </button>
            </div>
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
      <NodeDetail
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
        neighbors={selectedNodeNeighbors}
        onNavigateToNode={handleNavigateToNode}
        onNavigateToNodeId={handleNavigateToNodeId}
        onFocusNode={handleNodeFocus}
        analytics={selectedNodeAnalytics}
      />
    </div>
  );
}
