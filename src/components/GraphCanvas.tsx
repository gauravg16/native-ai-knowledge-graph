"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useMemo } from "react";
import { GraphNode, GraphLink, GraphData, NodeType, EdgeType } from "@/lib/types";
import { NODE_CONFIG, EDGE_CONFIG, CANVAS_BG } from "@/lib/constants";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full w-full bg-slate-900">
      <div className="text-slate-400 text-sm">Loading graph engine...</div>
    </div>
  ),
});

interface GraphCanvasProps {
  graphData: GraphData;
  onNodeClick: (node: GraphNode) => void;
  width: number;
  height: number;
}

export default function GraphCanvas({
  graphData,
  onNodeClick,
  width,
  height,
}: GraphCanvasProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);

  // Auto-zoom to fit on data change
  useEffect(() => {
    const timer = setTimeout(() => {
      fgRef.current?.zoomToFit(400, 60);
    }, 500);
    return () => clearTimeout(timer);
  }, [graphData]);

  const paintNode = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const cfg = NODE_CONFIG[node.type as keyof typeof NODE_CONFIG];
      if (!cfg) return;

      const radius = Math.sqrt(cfg.size) * 1.8;
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      // Glow for high-priority nodes
      if (cfg.priority >= 7) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 3, 0, 2 * Math.PI);
        ctx.fillStyle = cfg.color + "22";
        ctx.fill();
      }

      // Main circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = cfg.color;
      ctx.fill();

      // Border
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Label for important nodes or when zoomed in
      const fontSize = Math.max(11 / globalScale, 1.2);
      if (globalScale > 1.2 || cfg.priority >= 6) {
        const label = (node.label as string) || "";
        const display = label.length > 22 ? label.slice(0, 20) + ".." : label;
        ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillText(display, x, y + radius + 2);
      }
    },
    [],
  );

  const filteredData = useMemo(() => {
    const nodeIds = new Set(graphData.nodes.map((n) => n.id));
    return {
      nodes: [...graphData.nodes],
      links: graphData.links.filter(
        (l) =>
          nodeIds.has(typeof l.source === "string" ? l.source : l.source?.id) &&
          nodeIds.has(typeof l.target === "string" ? l.target : l.target?.id),
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
        return EDGE_CONFIG[edgeType]?.color || "rgba(255,255,255,0.05)";
      }}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      linkWidth={(link: any) => {
        const edgeType = link.type as EdgeType;
        return EDGE_CONFIG[edgeType]?.width || 0.5;
      }}
      linkDirectionalArrowLength={3.5}
      linkDirectionalArrowRelPos={1}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onNodeClick={(node: any) => onNodeClick(node as GraphNode)}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodeLabel={(node: any) => {
        const type = node.type as NodeType;
        return `${NODE_CONFIG[type]?.label || type}: ${node.label}`;
      }}
      d3AlphaDecay={0.04}
      d3VelocityDecay={0.3}
      warmupTicks={50}
      cooldownTicks={200}
      enableNodeDrag={true}
      enableZoomInteraction={true}
    />
  );
}
