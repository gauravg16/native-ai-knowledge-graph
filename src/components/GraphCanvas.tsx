"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useRef,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  GraphNode,
  GraphData,
  NodeType,
  EdgeType,
  FocusState,
  PathState,
} from "@/lib/types";
import { NODE_CONFIG, EDGE_CONFIG, CANVAS_BG } from "@/lib/constants";
import { getLinkKey } from "@/lib/graph-utils";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full w-full bg-slate-900">
      <div className="text-slate-400 text-sm">Loading graph engine...</div>
    </div>
  ),
});

export interface GraphCanvasHandle {
  centerOnNode: (node: GraphNode, zoomLevel?: number) => void;
  zoomToFit: () => void;
}

interface GraphCanvasProps {
  graphData: GraphData;
  onNodeClick: (node: GraphNode) => void;
  onNodeDoubleClick?: (node: GraphNode) => void;
  onBackgroundClick?: () => void;
  focusState: FocusState | null;
  pathState: PathState;
  searchHighlightIds: Set<string>;
  width: number;
  height: number;
}

const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(
  function GraphCanvas(
    {
      graphData,
      onNodeClick,
      onNodeDoubleClick,
      onBackgroundClick,
      focusState,
      pathState,
      searchHighlightIds,
      width,
      height,
    },
    ref,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fgRef = useRef<any>(null);
    const lastClickRef = useRef<{ nodeId: string; time: number } | null>(null);

    useImperativeHandle(ref, () => ({
      centerOnNode: (node: GraphNode, zoomLevel = 4) => {
        if (fgRef.current && node.x != null && node.y != null) {
          fgRef.current.centerAt(node.x, node.y, 600);
          fgRef.current.zoom(zoomLevel, 600);
        }
      },
      zoomToFit: () => {
        fgRef.current?.zoomToFit(400, 60);
      },
    }));

    // Auto-zoom to fit on data change
    useEffect(() => {
      const timer = setTimeout(() => {
        fgRef.current?.zoomToFit(400, 60);
      }, 500);
      return () => clearTimeout(timer);
    }, [graphData]);

    // Double-click detection via timer
    const handleClick = useCallback(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (node: any) => {
        const now = Date.now();
        const nodeObj = node as GraphNode;

        if (
          lastClickRef.current &&
          lastClickRef.current.nodeId === nodeObj.id &&
          now - lastClickRef.current.time < 350
        ) {
          onNodeDoubleClick?.(nodeObj);
          lastClickRef.current = null;
        } else {
          lastClickRef.current = { nodeId: nodeObj.id, time: now };
          onNodeClick(nodeObj);
        }
      },
      [onNodeClick, onNodeDoubleClick],
    );

    const paintNode = useCallback(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const cfg = NODE_CONFIG[node.type as keyof typeof NODE_CONFIG];
        if (!cfg) return;

        const baseRadius = Math.sqrt(cfg.size) * 1.8;
        const x = node.x ?? 0;
        const y = node.y ?? 0;
        const nodeId = node.id as string;

        // Determine visual state
        let opacity = 1.0;
        let glowColor: string | null = null;
        let ringColor: string | null = null;

        // Focus mode
        if (focusState) {
          if (nodeId === focusState.nodeId) {
            glowColor = cfg.color;
            ringColor = "#ffffff";
          } else if (focusState.neighborIds.has(nodeId)) {
            opacity = 1.0;
          } else {
            opacity = 0.06;
          }
        }

        // Path highlighting (overrides focus dimming for path nodes)
        if (pathState.path && pathState.path.includes(nodeId)) {
          glowColor = "#f59e0b";
          ringColor = "#f59e0b";
          opacity = 1.0;
        }

        // Search highlighting
        if (searchHighlightIds.size > 0) {
          if (searchHighlightIds.has(nodeId)) {
            glowColor = "#3b82f6";
            opacity = 1.0;
          } else if (!focusState && !pathState.path) {
            opacity = 0.15;
          }
        }

        const r = baseRadius;

        ctx.globalAlpha = opacity;

        // Outer glow ring
        if (glowColor) {
          ctx.beginPath();
          ctx.arc(x, y, r + 6, 0, 2 * Math.PI);
          ctx.fillStyle = glowColor + "22";
          ctx.fill();

          ctx.beginPath();
          ctx.arc(x, y, r + 3, 0, 2 * Math.PI);
          ctx.fillStyle = glowColor + "44";
          ctx.fill();
        } else if (cfg.priority >= 7 && opacity > 0.5) {
          // Default glow for high-priority
          ctx.beginPath();
          ctx.arc(x, y, r + 3, 0, 2 * Math.PI);
          ctx.fillStyle = cfg.color + "22";
          ctx.fill();
        }

        // Main circle
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.fillStyle = cfg.color;
        ctx.fill();

        // Ring or default border
        if (ringColor) {
          ctx.strokeStyle = ringColor;
          ctx.lineWidth = 2 / globalScale;
          ctx.stroke();
        } else {
          ctx.strokeStyle = "rgba(255,255,255,0.15)";
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }

        // Label
        const fontSize = Math.max(11 / globalScale, 1.2);
        if (globalScale > 1.2 || cfg.priority >= 6 || glowColor) {
          const label = (node.label as string) || "";
          const display =
            label.length > 22 ? label.slice(0, 20) + ".." : label;
          ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = `rgba(255,255,255,${Math.max(opacity * 0.8, 0.05)})`;
          ctx.fillText(display, x, y + r + 2);
        }

        ctx.globalAlpha = 1.0;
      },
      [focusState, pathState, searchHighlightIds],
    );

    const filteredData = useMemo(() => {
      const nodeIds = new Set(graphData.nodes.map((n) => n.id));
      return {
        nodes: [...graphData.nodes],
        links: graphData.links.filter(
          (l) =>
            nodeIds.has(
              typeof l.source === "string" ? l.source : l.source?.id,
            ) &&
            nodeIds.has(
              typeof l.target === "string" ? l.target : l.target?.id,
            ),
        ),
      };
    }, [graphData]);

    return (
      <ForceGraph2D
        ref={fgRef}
        graphData={filteredData}
        width={width}
        height={height}
        backgroundColor={CANVAS_BG}
        nodeCanvasObject={paintNode}
        nodeCanvasObjectMode={() => "replace"}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodeVal={(node: any) => node.val || 4}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        linkColor={(link: any) => {
          const edgeType = link.type as EdgeType;
          const baseCfg = EDGE_CONFIG[edgeType];
          const baseColor = baseCfg?.color || "rgba(255,255,255,0.05)";
          const key = getLinkKey(link);

          if (focusState) {
            if (focusState.linkKeys.has(key))
              return baseColor.replace(/[\d.]+\)$/, "0.7)");
            return "rgba(255,255,255,0.015)";
          }

          if (pathState.pathLinkKeys.size > 0) {
            if (pathState.pathLinkKeys.has(key))
              return "rgba(245,158,11,0.9)";
            return baseColor.replace(/[\d.]+\)$/, "0.05)");
          }

          if (searchHighlightIds.size > 0) {
            return baseColor.replace(/[\d.]+\)$/, "0.08)");
          }

          return baseColor;
        }}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        linkWidth={(link: any) => {
          const edgeType = link.type as EdgeType;
          const key = getLinkKey(link);

          if (pathState.pathLinkKeys.has(key)) return 3;
          if (focusState && focusState.linkKeys.has(key)) return 2;

          return EDGE_CONFIG[edgeType]?.width || 0.5;
        }}
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        linkDirectionalParticles={(link: any) => {
          const key = getLinkKey(link);
          if (pathState.pathLinkKeys.has(key)) return 3;
          return 0;
        }}
        linkDirectionalParticleWidth={3}
        linkDirectionalParticleSpeed={0.006}
        linkDirectionalParticleColor={() => "#f59e0b"}
        onNodeClick={handleClick}
        onBackgroundClick={onBackgroundClick}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodeLabel={(node: any) => {
          const type = node.type as NodeType;
          const cfg = NODE_CONFIG[type];
          const props = node.properties || {};
          const details = Object.entries(props)
            .filter(
              ([, v]) => v !== null && v !== undefined && v !== "",
            )
            .slice(0, 3)
            .map(
              ([k, v]) =>
                `<div style="font-size:10px;color:#94a3b8;margin-top:2px">${k.replace(/_/g, " ")}: ${String(v).slice(0, 60)}</div>`,
            )
            .join("");

          return `<div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:8px 12px;max-width:260px;font-family:Inter,system-ui,sans-serif">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
              <span style="width:8px;height:8px;border-radius:50%;background:${cfg?.color};display:inline-block"></span>
              <span style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">${cfg?.label || type}</span>
            </div>
            <div style="font-size:13px;color:#e2e8f0;font-weight:600">${node.label}</div>
            ${details}
          </div>`;
        }}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        linkLabel={(link: any) => {
          const edgeType = link.type as EdgeType;
          const cfg = EDGE_CONFIG[edgeType];
          return cfg?.label || edgeType;
        }}
        linkHoverPrecision={6}
        d3AlphaDecay={0.04}
        d3VelocityDecay={0.3}
        warmupTicks={50}
        cooldownTicks={200}
        enableNodeDrag={true}
        enableZoomInteraction={true}
      />
    );
  },
);

export default GraphCanvas;
