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
} from "../lib/types";
import { NODE_CONFIG, EDGE_CONFIG, CANVAS_BG, PRIORITY_COLORS } from "../lib/constants";
import { getLinkKey } from "../lib/graph-utils";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full w-full bg-slate-900">
      <div className="text-slate-400 text-sm">Loading graph engine...</div>
    </div>
  ),
});

/* ------------------------------------------------------------------ */
/*  Per-type node glyphs (drawn inside the circle)                     */
/* ------------------------------------------------------------------ */

function drawGlyph(
  ctx: CanvasRenderingContext2D,
  type: string,
  x: number,
  y: number,
  radius: number,
  globalScale: number,
  properties?: Record<string, unknown>,
) {
  const s = radius * 0.5; // glyph half-size
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = Math.max(1.2 / globalScale, 0.4);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (type) {
    case "organization": {
      // 4-point star
      const outer = s * 0.9;
      const inner = s * 0.35;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2 - Math.PI / 2;
        const midAngle = angle + Math.PI / 4;
        ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
        ctx.lineTo(x + Math.cos(midAngle) * inner, y + Math.sin(midAngle) * inner);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "user": {
      // Head (circle) + shoulders (arc)
      const headR = s * 0.35;
      ctx.beginPath();
      ctx.arc(x, y - s * 0.2, headR, 0, 2 * Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y + s * 0.7, s * 0.55, Math.PI + 0.5, -0.5);
      ctx.stroke();
      break;
    }
    case "contact": {
      // Same silhouette as user + small "+" mark
      const headR = s * 0.3;
      ctx.beginPath();
      ctx.arc(x, y - s * 0.2, headR, 0, 2 * Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y + s * 0.7, s * 0.5, Math.PI + 0.5, -0.5);
      ctx.stroke();
      // "+" at top-right
      const px = x + s * 0.55;
      const py = y - s * 0.55;
      const ps = s * 0.25;
      ctx.beginPath();
      ctx.moveTo(px - ps, py);
      ctx.lineTo(px + ps, py);
      ctx.moveTo(px, py - ps);
      ctx.lineTo(px, py + ps);
      ctx.stroke();
      break;
    }
    case "channel": {
      // Hash # (two horizontal + two vertical lines)
      const d = s * 0.3;
      const len = s * 0.7;
      ctx.beginPath();
      // Horizontal lines
      ctx.moveTo(x - len, y - d);
      ctx.lineTo(x + len, y - d);
      ctx.moveTo(x - len, y + d);
      ctx.lineTo(x + len, y + d);
      // Vertical lines
      ctx.moveTo(x - d, y - len);
      ctx.lineTo(x - d, y + len);
      ctx.moveTo(x + d, y - len);
      ctx.lineTo(x + d, y + len);
      ctx.stroke();
      break;
    }
    case "meeting": {
      // Calendar: square with top bar
      const half = s * 0.65;
      const topBar = y - half + half * 0.4;
      ctx.beginPath();
      ctx.rect(x - half, y - half, half * 2, half * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - half, topBar);
      ctx.lineTo(x + half, topBar);
      ctx.stroke();
      // Two small pegs on top
      const pegH = s * 0.2;
      ctx.beginPath();
      ctx.moveTo(x - half * 0.4, y - half);
      ctx.lineTo(x - half * 0.4, y - half - pegH);
      ctx.moveTo(x + half * 0.4, y - half);
      ctx.lineTo(x + half * 0.4, y - half - pegH);
      ctx.stroke();
      break;
    }
    case "insight": {
      // Lightbulb: circle (bulb) + small base
      const bulbR = s * 0.4;
      ctx.beginPath();
      ctx.arc(x, y - s * 0.1, bulbR, 0, 2 * Math.PI);
      ctx.stroke();
      // Base lines (filament)
      const baseY = y - s * 0.1 + bulbR;
      ctx.beginPath();
      ctx.moveTo(x - bulbR * 0.5, baseY);
      ctx.lineTo(x - bulbR * 0.35, baseY + s * 0.3);
      ctx.lineTo(x + bulbR * 0.35, baseY + s * 0.3);
      ctx.lineTo(x + bulbR * 0.5, baseY);
      ctx.stroke();
      // Small rays
      const rayLen = s * 0.2;
      for (const angle of [-Math.PI / 4, 0, Math.PI / 4]) {
        const rx = x + Math.cos(angle) * (bulbR + 2);
        const ry = (y - s * 0.1) + Math.sin(angle) * (bulbR + 2);
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + Math.cos(angle) * rayLen, ry + Math.sin(angle) * rayLen);
        ctx.stroke();
      }
      break;
    }
    case "task": {
      // Checkbox square; checkmark if done
      const half = s * 0.55;
      ctx.beginPath();
      ctx.rect(x - half, y - half, half * 2, half * 2);
      ctx.stroke();
      const state = ((properties?.state as string) || "").toLowerCase();
      if (state === "done" || state === "completed") {
        ctx.beginPath();
        ctx.moveTo(x - half * 0.5, y);
        ctx.lineTo(x - half * 0.1, y + half * 0.5);
        ctx.lineTo(x + half * 0.6, y - half * 0.4);
        ctx.lineWidth = Math.max(1.6 / globalScale, 0.5);
        ctx.strokeStyle = "#4ade80"; // green checkmark
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = Math.max(1.2 / globalScale, 0.4);
      }
      break;
    }
    case "context": {
      // Document with corner fold
      const half = s * 0.6;
      const fold = half * 0.4;
      ctx.beginPath();
      ctx.moveTo(x - half, y - half);
      ctx.lineTo(x + half - fold, y - half);
      ctx.lineTo(x + half, y - half + fold);
      ctx.lineTo(x + half, y + half);
      ctx.lineTo(x - half, y + half);
      ctx.closePath();
      ctx.stroke();
      // Corner fold line
      ctx.beginPath();
      ctx.moveTo(x + half - fold, y - half);
      ctx.lineTo(x + half - fold, y - half + fold);
      ctx.lineTo(x + half, y - half + fold);
      ctx.stroke();
      break;
    }
    case "message": {
      // Chat bubble: rounded rect with tail
      const w = s * 0.7;
      const h = s * 0.5;
      const cr = s * 0.15; // corner radius
      // Rounded rect
      ctx.beginPath();
      ctx.moveTo(x - w + cr, y - h);
      ctx.lineTo(x + w - cr, y - h);
      ctx.quadraticCurveTo(x + w, y - h, x + w, y - h + cr);
      ctx.lineTo(x + w, y + h - cr);
      ctx.quadraticCurveTo(x + w, y + h, x + w - cr, y + h);
      ctx.lineTo(x - w + cr, y + h);
      ctx.quadraticCurveTo(x - w, y + h, x - w, y + h - cr);
      ctx.lineTo(x - w, y - h + cr);
      ctx.quadraticCurveTo(x - w, y - h, x - w + cr, y - h);
      ctx.closePath();
      ctx.stroke();
      // Tail
      ctx.beginPath();
      ctx.moveTo(x - w * 0.3, y + h);
      ctx.lineTo(x - w * 0.6, y + h + s * 0.3);
      ctx.lineTo(x, y + h);
      ctx.stroke();
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Link distance per edge type                                        */
/* ------------------------------------------------------------------ */

const LINK_DISTANCES: Record<EdgeType, number> = {
  MEMBER_OF: 50,
  HAS_CHANNEL: 60,
  IN_ORG: 40,
  REPORTS_TO: 55,
  AUTHORED_BY: 70,
  POSTED_IN: 90,
  REPLIES_TO: 60,
  FROM_MEETING: 80,
  FROM_INSIGHT: 80,
  MENTIONS: 70,
  READ_BY: 100,
  ASSIGNED_TO: 85,
  OWNED_BY: 85,
  PARTICIPATED_IN: 65,
};

/* ------------------------------------------------------------------ */
/*  Type-bias angles — nudge each type toward a spatial sector         */
/* ------------------------------------------------------------------ */

const TYPE_ANGLES: Record<NodeType, number> = {
  organization: 0,
  user: Math.PI / 2,
  channel: Math.PI,
  meeting: -Math.PI / 2,
  contact: (3 * Math.PI) / 4,
  insight: Math.PI / 4,
  task: -Math.PI / 4,
  context: (-3 * Math.PI) / 4,
  message: Math.PI,
};

const CLUSTER_RADIUS = 150;
const CLUSTER_STRENGTH = 0.03;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

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

    // Configure d3 forces for better layout
    useEffect(() => {
      const applyForces = () => {
        const fg = fgRef.current;
        if (!fg) return false;

        // a) Charge: degree-adaptive repulsion
        const charge = fg.d3Force("charge");
        if (charge) {
          charge
            .strength((node: Record<string, unknown>) => {
              const degree = (node.__degree as number) ?? 0;
              return -80 - Math.min(degree * 4, 220);
            })
            .distanceMax(400);
        }

        // b) Link: type-based distance + degree-adaptive strength
        const link = fg.d3Force("link");
        if (link) {
          link.distance((l: Record<string, unknown>) => {
            const type = l.type as EdgeType;
            return LINK_DISTANCES[type] ?? 70;
          });
          link.strength((l: Record<string, unknown>) => {
            const src = l.source as Record<string, unknown> | undefined;
            const tgt = l.target as Record<string, unknown> | undefined;
            const srcDeg = (src?.__degree as number) ?? 1;
            const tgtDeg = (tgt?.__degree as number) ?? 1;
            return 1 / Math.max(1, Math.sqrt(Math.max(srcDeg, tgtDeg)));
          });
        }

        // c) Collision: prevent visual overlap
        import("d3-force-3d").then((d3) => {
          fg.d3Force(
            "collision",
            d3
              .forceCollide()
              .radius((node: Record<string, unknown>) => {
                const val = (node.val as number) ?? 4;
                return Math.sqrt(val) * 1.8 + 4;
              })
              .strength(0.7)
              .iterations(3),
          );

          // d) Type-bias: gentle spatial separation
          fg.d3Force(
            "typeX",
            d3
              .forceX()
              .x((node: Record<string, unknown>) => {
                const type = (node.type as NodeType) || "message";
                if (type === "organization") return 0;
                const angle = TYPE_ANGLES[type] ?? 0;
                return Math.cos(angle) * CLUSTER_RADIUS;
              })
              .strength(CLUSTER_STRENGTH),
          );

          fg.d3Force(
            "typeY",
            d3
              .forceY()
              .y((node: Record<string, unknown>) => {
                const type = (node.type as NodeType) || "message";
                if (type === "organization") return 0;
                const angle = TYPE_ANGLES[type] ?? 0;
                return Math.sin(angle) * CLUSTER_RADIUS;
              })
              .strength(CLUSTER_STRENGTH),
          );

          fg.d3ReheatSimulation();
        });

        return true;
      };

      // Try immediately (works on subsequent data changes when ref exists)
      if (applyForces()) return;

      // Retry for initial load — ForceGraph2D is dynamically imported,
      // so fgRef.current may not be set when this effect first fires.
      const timer = setInterval(() => {
        if (applyForces()) clearInterval(timer);
      }, 100);
      return () => clearInterval(timer);
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

        const baseRadius = Math.sqrt(node.val ?? cfg.size) * 1.8;
        const x = node.x ?? 0;
        const y = node.y ?? 0;
        const nodeId = node.id as string;
        const degree: number = node.__degree ?? 0;

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

        // Task: completed state reduces fill opacity
        const taskState = node.type === "task"
          ? ((node.properties?.state as string) || "").toLowerCase()
          : "";
        const taskDone = taskState === "done" || taskState === "completed";
        if (node.type === "task" && taskDone) {
          ctx.fillStyle = cfg.color;
          ctx.globalAlpha = opacity * 0.5;
          ctx.fill();
          ctx.globalAlpha = opacity;
        } else {
          ctx.fillStyle = cfg.color;
          ctx.fill();
        }

        // Ring or default border (with task priority override)
        if (ringColor) {
          ctx.strokeStyle = ringColor;
          ctx.lineWidth = 2 / globalScale;
          ctx.stroke();
        // NOTE: Task priority ring disabled until backend priority logic is reviewed.
        // The PRIORITY_COLORS map (constants.ts) is kept for future use.
        // } else if (node.type === "task" && !ringColor) {
        //   const priority = ((node.properties?.priority as string) || "none").toLowerCase();
        //   const pc = PRIORITY_COLORS[priority] || PRIORITY_COLORS.none;
        //   ctx.strokeStyle = pc.color;
        //   ctx.lineWidth = pc.width / globalScale;
        //   ctx.stroke();
        } else if (degree > 20 && opacity > 0.5) {
          // Hub nodes: visible colored border
          ctx.strokeStyle = cfg.color + "80";
          ctx.lineWidth = 1.5 / globalScale;
          ctx.stroke();
        } else {
          ctx.strokeStyle = "rgba(255,255,255,0.15)";
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }

        // Task: overdue indicator (red dot at top-right)
        if (node.type === "task" && !taskDone && opacity > 0.3) {
          const dueAt = node.properties?.due_at as string;
          if (dueAt && new Date(dueAt) < new Date()) {
            ctx.beginPath();
            ctx.arc(x + r * 0.65, y - r * 0.65, Math.max(3 / globalScale, 1.5), 0, 2 * Math.PI);
            ctx.fillStyle = "#ef4444";
            ctx.fill();
          }
        }

        // Per-type glyph inside the circle
        if (globalScale > 0.6 && opacity > 0.3) {
          drawGlyph(ctx, node.type as string, x, y, r, globalScale, node.properties);
        }

        // Label — tiered visibility based on priority + zoom
        const showLabel =
          glowColor ||
          cfg.priority >= 8 ||
          (cfg.priority >= 6 && globalScale > 0.8) ||
          (cfg.priority >= 3 && globalScale > 1.5) ||
          globalScale > 2.5;

        if (showLabel) {
          const baseFontSize =
            cfg.priority >= 7 ? 12 : cfg.priority >= 5 ? 10 : 9;
          const fontSize = Math.max(baseFontSize / globalScale, 1.0);
          const label = (node.label as string) || "";
          const display =
            label.length > 22 ? label.slice(0, 20) + ".." : label;
          ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";

          // Background pill for readability
          const textWidth = ctx.measureText(display).width;
          const pad = 1.5;
          const labelY = y + r + 2;

          ctx.fillStyle = `rgba(15, 23, 42, ${Math.min(opacity * 0.7, 0.7)})`;
          ctx.fillRect(
            x - textWidth / 2 - pad,
            labelY - pad,
            textWidth + pad * 2,
            fontSize + pad * 2,
          );

          ctx.fillStyle = `rgba(255,255,255,${Math.max(opacity * 0.85, 0.05)})`;
          ctx.fillText(display, x, labelY);
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
        d3AlphaDecay={0.025}
        d3VelocityDecay={0.35}
        warmupTicks={80}
        cooldownTicks={300}
        enableNodeDrag={true}
        enableZoomInteraction={true}
      />
    );
  },
);

export default GraphCanvas;
