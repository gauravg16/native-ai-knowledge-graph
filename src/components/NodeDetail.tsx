"use client";

import { useMemo } from "react";
import { GraphNode, NeighborInfo, EdgeType, NodeType } from "../lib/types";
import { NODE_CONFIG, EDGE_CONFIG } from "../lib/constants";
import {
  formatRelativeDate,
  formatShortDate,
  NodeAnalytics,
  PersonAnalytics,
  MeetingAnalytics,
  InsightAnalytics,
  TaskAnalytics,
} from "../lib/graph-utils";

/* Keys handled by type-specific rendering — skipped in the generic fallback */
const TYPED_KEYS: Partial<Record<NodeType, Set<string>>> = {
  task: new Set(["priority", "state", "due_at", "assignee", "created_at"]),
  insight: new Set(["confidence", "impact", "type", "occurrence_count", "owner", "summary", "created_at"]),
  meeting: new Set(["started_at", "ended_at", "participant_count", "participants", "platform", "created_at"]),
  contact: new Set([
    "is_primary_contact", "role", "department", "company_name",
    "relationship_type", "tags", "email", "location", "created_at",
  ]),
  message: new Set(["is_ai_response", "status", "mention_count", "content_preview", "created_at"]),
};

/* ------------------------------------------------------------------ */
/*  Reusable micro-components                                          */
/* ------------------------------------------------------------------ */

function Pill({ children, bg, text }: { children: React.ReactNode; bg: string; text: string }) {
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${bg} ${text}`}>
      {children}
    </span>
  );
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider w-24 flex-shrink-0 pt-0.5">
        {label}
      </span>
      <div className="text-sm text-slate-300 flex-1">{children}</div>
    </div>
  );
}

function RelativeTime({ iso, isDue }: { iso: unknown; isDue?: boolean }) {
  if (typeof iso !== "string") return null;
  const rel = formatRelativeDate(iso, isDue);
  const short = formatShortDate(iso);
  if (!rel) return <span>{short}</span>;
  return (
    <span className={rel.isOverdue ? "text-red-400" : ""} title={short || undefined}>
      {rel.text}{rel.isOverdue ? " (overdue)" : ""}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Type-specific property renderers                                    */
/* ------------------------------------------------------------------ */

const PRIORITY_STYLES: Record<string, { bg: string; text: string }> = {
  urgent: { bg: "bg-red-500/20",    text: "text-red-300" },
  high:   { bg: "bg-orange-500/20", text: "text-orange-300" },
  medium: { bg: "bg-cyan-500/20",   text: "text-cyan-300" },
  low:    { bg: "bg-slate-500/20",  text: "text-slate-400" },
  none:   { bg: "bg-slate-500/20",  text: "text-slate-400" },
};

const STATE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  done:      { bg: "bg-green-500/20", text: "text-green-300", label: "Done" },
  completed: { bg: "bg-green-500/20", text: "text-green-300", label: "Completed" },
  open:      { bg: "bg-blue-500/20",  text: "text-blue-300",  label: "Open" },
  pending:   { bg: "bg-amber-500/20", text: "text-amber-300", label: "Pending" },
  in_progress: { bg: "bg-purple-500/20", text: "text-purple-300", label: "In Progress" },
};

function TaskProperties({ props }: { props: Record<string, unknown> }) {
  const priority = ((props.priority as string) || "none").toLowerCase();
  const state = ((props.state as string) || "").toLowerCase();
  const ps = PRIORITY_STYLES[priority] || PRIORITY_STYLES.none;
  const ss = STATE_STYLES[state] || { bg: "bg-slate-500/20", text: "text-slate-400", label: state || "Unknown" };

  return (
    <>
      <PropRow label="Priority"><Pill bg={ps.bg} text={ps.text}>{priority}</Pill></PropRow>
      <PropRow label="State"><Pill bg={ss.bg} text={ss.text}>{ss.label}</Pill></PropRow>
      {props.due_at && (
        <PropRow label="Due"><RelativeTime iso={props.due_at} isDue /></PropRow>
      )}
      {props.assignee && (
        <PropRow label="Assignee"><span>{String(props.assignee)}</span></PropRow>
      )}
      <PropRow label="Created"><RelativeTime iso={props.created_at} /></PropRow>
    </>
  );
}

function InsightProperties({ props }: { props: Record<string, unknown> }) {
  const confidence = typeof props.confidence === "number" ? props.confidence : null;
  const impact = ((props.impact as string) || "").toLowerCase();
  const type = (props.type as string) || "";
  const occurrences = typeof props.occurrence_count === "number" ? props.occurrence_count : null;

  const impactStyles: Record<string, { bg: string; text: string }> = {
    high:   { bg: "bg-red-500/20",   text: "text-red-300" },
    medium: { bg: "bg-amber-500/20", text: "text-amber-300" },
    low:    { bg: "bg-slate-500/20", text: "text-slate-400" },
  };
  const is = impactStyles[impact] || { bg: "bg-slate-500/20", text: "text-slate-400" };

  return (
    <>
      {confidence !== null && (
        <PropRow label="Confidence">
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, confidence * 100))}%` }}
              />
            </div>
            <span className="text-[11px] text-amber-300">{Math.round(confidence * 100)}%</span>
          </div>
        </PropRow>
      )}
      {impact && <PropRow label="Impact"><Pill bg={is.bg} text={is.text}>{impact}</Pill></PropRow>}
      {type && <PropRow label="Type"><Pill bg="bg-slate-500/20" text="text-slate-400">{type}</Pill></PropRow>}
      {occurrences !== null && occurrences > 1 && (
        <PropRow label="Occurrences">
          <span className="text-[11px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-medium">
            {occurrences}&times;
          </span>
        </PropRow>
      )}
      {props.owner && <PropRow label="Owner"><span>{String(props.owner)}</span></PropRow>}
      {props.summary && (
        <PropRow label="Summary">
          <span className="text-slate-400 text-xs leading-relaxed">{String(props.summary)}</span>
        </PropRow>
      )}
      <PropRow label="Created"><RelativeTime iso={props.created_at} /></PropRow>
    </>
  );
}

function MeetingProperties({ props }: { props: Record<string, unknown> }) {
  const startShort = formatShortDate(props.started_at as string);
  const endShort = formatShortDate(props.ended_at as string);

  // Compute duration
  let duration: string | null = null;
  if (typeof props.started_at === "string" && typeof props.ended_at === "string") {
    const ms = new Date(props.ended_at).getTime() - new Date(props.started_at).getTime();
    if (ms > 0) {
      const mins = Math.round(ms / 60000);
      if (mins < 60) duration = `${mins} min`;
      else {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        duration = m > 0 ? `${h}h ${m}m` : `${h} hour${h !== 1 ? "s" : ""}`;
      }
    }
  }

  return (
    <>
      {startShort && (
        <PropRow label="When">
          <span>{startShort}{endShort ? ` \u2013 ${endShort.replace(/^[A-Za-z]+ \d+, /, "")}` : ""}</span>
        </PropRow>
      )}
      {duration && <PropRow label="Duration"><span>{duration}</span></PropRow>}
      {typeof props.participant_count === "number" && (
        <PropRow label="Participants">
          <span>{props.participant_count} {props.participant_count === 1 ? "person" : "people"}</span>
        </PropRow>
      )}
      {props.platform && <PropRow label="Platform"><span>{String(props.platform)}</span></PropRow>}
      <PropRow label="Created"><RelativeTime iso={props.created_at} /></PropRow>
    </>
  );
}

function ContactProperties({ props }: { props: Record<string, unknown> }) {
  const isPrimary = !!props.is_primary_contact;
  const tags = Array.isArray(props.tags) ? (props.tags as string[]) : [];

  return (
    <>
      {isPrimary && (
        <div className="flex items-center gap-1.5 py-1">
          <span className="text-amber-400 text-xs">&#9733;</span>
          <span className="text-[11px] text-amber-300 font-medium">Primary Contact</span>
        </div>
      )}
      {props.role && <PropRow label="Role"><span>{String(props.role)}</span></PropRow>}
      {props.department && (
        <PropRow label="Department">
          <Pill bg="bg-slate-500/20" text="text-slate-400">{String(props.department)}</Pill>
        </PropRow>
      )}
      {props.company_name && <PropRow label="Company"><span>{String(props.company_name)}</span></PropRow>}
      {props.relationship_type && (
        <PropRow label="Relationship">
          <Pill bg="bg-emerald-500/20" text="text-emerald-300">{String(props.relationship_type)}</Pill>
        </PropRow>
      )}
      {tags.length > 0 && (
        <PropRow label="Tags">
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <Pill key={t} bg="bg-violet-500/20" text="text-violet-300">{t}</Pill>
            ))}
          </div>
        </PropRow>
      )}
      {props.email && <PropRow label="Email"><span className="text-blue-300">{String(props.email)}</span></PropRow>}
      {props.location && <PropRow label="Location"><span>{String(props.location)}</span></PropRow>}
      <PropRow label="Created"><RelativeTime iso={props.created_at} /></PropRow>
    </>
  );
}

function MessageProperties({ props }: { props: Record<string, unknown> }) {
  const isAI = !!props.is_ai_response;

  return (
    <>
      <PropRow label="Source">
        <Pill bg={isAI ? "bg-purple-500/20" : "bg-blue-500/20"} text={isAI ? "text-purple-300" : "text-blue-300"}>
          {isAI ? "AI" : "Human"}
        </Pill>
      </PropRow>
      {props.status && <PropRow label="Status"><span>{String(props.status)}</span></PropRow>}
      {typeof props.mention_count === "number" && props.mention_count > 0 && (
        <PropRow label="Mentions"><span>{props.mention_count}</span></PropRow>
      )}
      {props.content_preview && (
        <PropRow label="Content">
          <span className="text-slate-400 text-xs leading-relaxed">{String(props.content_preview)}</span>
        </PropRow>
      )}
      <PropRow label="Created"><RelativeTime iso={props.created_at} /></PropRow>
    </>
  );
}

function TypedProperties({ node, props }: { node: GraphNode; props: Record<string, unknown> }) {
  switch (node.type) {
    case "task":    return <TaskProperties props={props} />;
    case "insight": return <InsightProperties props={props} />;
    case "meeting": return <MeetingProperties props={props} />;
    case "contact": return <ContactProperties props={props} />;
    case "message": return <MessageProperties props={props} />;
    default:        return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Analytics section renderers                                         */
/* ------------------------------------------------------------------ */

function AnalyticRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[10px] text-slate-500 uppercase">{label}</span>
      <div className="text-xs text-slate-300">{children}</div>
    </div>
  );
}

function MiniBar({ open, done, overdue, total }: { open: number; done: number; overdue: number; total: number }) {
  if (total === 0) return <span className="text-slate-500">None</span>;
  const w = 64;
  const openW = (open / total) * w;
  const doneW = (done / total) * w;
  const overdueW = (overdue / total) * w;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex h-1.5 rounded-full overflow-hidden" style={{ width: w }}>
        <div className="bg-blue-500/70 h-full" style={{ width: openW }} />
        <div className="bg-emerald-500/70 h-full" style={{ width: doneW }} />
        <div className="bg-red-500/70 h-full" style={{ width: overdueW }} />
      </div>
      <span className="text-[10px] tabular-nums">
        <span className="text-blue-400">{open - overdue}o</span>
        {" "}<span className="text-emerald-400">{done}d</span>
        {overdue > 0 && <>{" "}<span className="text-red-400">{overdue}!</span></>}
      </span>
    </div>
  );
}

function PersonAnalyticsSection({ a }: { a: PersonAnalytics }) {
  return (
    <>
      <AnalyticRow label="Tasks">
        <MiniBar open={a.openTasks} done={a.completedTasks} overdue={a.overdueTasks} total={a.totalTasks} />
      </AnalyticRow>
      {a.workloadVsMedian !== null && (
        <AnalyticRow label="Workload">
          <span className={a.workloadVsMedian > 1.3 ? "text-amber-400" : a.workloadVsMedian < 0.7 ? "text-blue-400" : "text-slate-300"}>
            {Math.round(a.workloadVsMedian * 100)}% of median
          </span>
        </AnalyticRow>
      )}
      {a.insightsOwned > 0 && (
        <AnalyticRow label="Insights">
          <span>
            {a.insightsOwned} owned
            {a.avgConfidence !== null && (
              <span className="text-slate-500 ml-1">
                (avg {Math.round(a.avgConfidence * 100)}%)
              </span>
            )}
          </span>
        </AnalyticRow>
      )}
      {a.meetingsAttended > 0 && (
        <AnalyticRow label="Meetings">
          <span>{a.meetingsAttended} attended</span>
        </AnalyticRow>
      )}
    </>
  );
}

function MeetingAnalyticsSection({ a }: { a: MeetingAnalytics }) {
  return (
    <>
      <AnalyticRow label="Output">
        <span>
          {a.insightsGenerated} insight{a.insightsGenerated !== 1 ? "s" : ""}
          {a.tasksDownstream > 0 && (
            <span className="text-slate-500"> &rarr; {a.tasksDownstream} task{a.tasksDownstream !== 1 ? "s" : ""}</span>
          )}
        </span>
      </AnalyticRow>
      <AnalyticRow label="Status">
        {a.productive ? (
          <span className="text-emerald-400 text-[10px] bg-emerald-500/15 px-1.5 py-0.5 rounded">Productive</span>
        ) : (
          <span className="text-slate-500 text-[10px] bg-slate-700/50 px-1.5 py-0.5 rounded">No output</span>
        )}
      </AnalyticRow>
      <AnalyticRow label="vs Avg">
        <span className="text-slate-400">
          {a.avgInsightsPerMeeting.toFixed(1)} insights/meeting
        </span>
      </AnalyticRow>
    </>
  );
}

function InsightAnalyticsSection({ a, onNavigate }: { a: InsightAnalytics; onNavigate: (id: string) => void }) {
  return (
    <>
      <AnalyticRow label="Status">
        {a.actioned ? (
          <span className="text-emerald-400 text-[10px] bg-emerald-500/15 px-1.5 py-0.5 rounded">
            Actioned ({a.taskCount} task{a.taskCount !== 1 ? "s" : ""})
          </span>
        ) : (
          <span className="text-amber-400 text-[10px] bg-amber-500/15 px-1.5 py-0.5 rounded">
            Not actioned
          </span>
        )}
      </AnalyticRow>
      {a.daysToAction !== null && (
        <AnalyticRow label="Time to action">
          <span>{a.daysToAction === 0 ? "Same day" : `${a.daysToAction} day${a.daysToAction !== 1 ? "s" : ""}`}</span>
        </AnalyticRow>
      )}
      {a.sourceMeeting && (
        <AnalyticRow label="From meeting">
          <button
            onClick={() => onNavigate(a.sourceMeeting!.id)}
            className="text-xs text-blue-300 hover:text-blue-200 truncate max-w-[140px]"
          >
            {a.sourceMeeting.label}
          </button>
        </AnalyticRow>
      )}
    </>
  );
}

function TaskAnalyticsSection({ a, onNavigate }: { a: TaskAnalytics; onNavigate: (id: string) => void }) {
  if (!a.sourceInsight && !a.sourceMeeting) return null;
  return (
    <>
      {/* Provenance breadcrumb: Meeting → Insight → Task */}
      <div className="text-[10px] text-slate-500 uppercase mb-1">Provenance</div>
      <div className="flex items-center gap-1 flex-wrap text-xs">
        {a.sourceMeeting && (
          <>
            <button
              onClick={() => onNavigate(a.sourceMeeting!.id)}
              className="text-rose-300 hover:text-rose-200 truncate max-w-[100px]"
            >
              {a.sourceMeeting.label}
            </button>
            <span className="text-slate-600">&rarr;</span>
          </>
        )}
        {a.sourceInsight && (
          <>
            <button
              onClick={() => onNavigate(a.sourceInsight!.id)}
              className="text-yellow-300 hover:text-yellow-200 truncate max-w-[100px]"
            >
              {a.sourceInsight.label}
            </button>
            {a.sourceInsight.confidence !== null && (
              <span className="text-[10px] text-slate-500">
                ({Math.round(a.sourceInsight.confidence * 100)}%)
              </span>
            )}
            <span className="text-slate-600">&rarr;</span>
          </>
        )}
        <span className="text-cyan-300">This task</span>
      </div>
    </>
  );
}

function NodeAnalyticsSection({
  analytics,
  onNavigate,
}: {
  analytics: NodeAnalytics;
  onNavigate: (nodeId: string) => void;
}) {
  if (!analytics) return null;
  return (
    <div className="px-4 py-3 border-b border-slate-800 bg-slate-800/20">
      <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-2">
        Analytics
      </div>
      {analytics.kind === "person" && <PersonAnalyticsSection a={analytics} />}
      {analytics.kind === "meeting" && <MeetingAnalyticsSection a={analytics} />}
      {analytics.kind === "insight" && <InsightAnalyticsSection a={analytics} onNavigate={onNavigate} />}
      {analytics.kind === "task" && <TaskAnalyticsSection a={analytics} onNavigate={onNavigate} />}
    </div>
  );
}

interface NodeDetailProps {
  node: GraphNode | null;
  onClose: () => void;
  neighbors: NeighborInfo[];
  onNavigateToNode: (node: GraphNode) => void;
  onNavigateToNodeId: (nodeId: string) => void;
  onFocusNode: (node: GraphNode) => void;
  analytics: NodeAnalytics;
}

export default function NodeDetail({
  node,
  onClose,
  neighbors,
  onNavigateToNode,
  onNavigateToNodeId,
  onFocusNode,
  analytics,
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
    <div
      className="absolute top-0 right-0 h-full w-80 bg-slate-900 border-l border-slate-700 shadow-2xl z-50 overflow-y-auto"
      style={{ backgroundColor: '#0f172a' }}
    >
      {/* Header */}
      <div
        className="sticky top-0 bg-slate-900 border-b border-slate-700 px-4 py-3 z-10"
        style={{ backgroundColor: '#0f172a' }}
      >
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
        {!!props._merged && (
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">
              Merged Identity
            </span>
            {Array.isArray(props._sourceTypes) && (props._sourceTypes as string[]).length > 1 && (
              <span className="text-[9px] text-slate-500">
                (appears as {(props._sourceTypes as string[]).join(" + ")})
              </span>
            )}
          </div>
        )}
        {neighbors.length > 0 && (
          <div className="text-[10px] text-slate-500 mt-1">
            {neighbors.length} connection{neighbors.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Analytics section */}
      <NodeAnalyticsSection
        analytics={analytics}
        onNavigate={onNavigateToNodeId}
      />

      {/* Type-specific properties */}
      {TYPED_KEYS[node.type] && (
        <div className="px-4 py-3 space-y-0.5 border-b border-slate-800">
          <TypedProperties node={node} props={props} />
        </div>
      )}

      {/* Generic fallback for remaining properties */}
      <div className="px-4 py-3 space-y-2">
        {Object.entries(props).map(([key, value]) => {
          if (value === null || value === undefined || value === "") return null;
          if (key.startsWith("_")) return null;
          if (TYPED_KEYS[node.type]?.has(key)) return null;
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
