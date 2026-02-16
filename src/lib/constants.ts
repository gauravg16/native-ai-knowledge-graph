import { NodeType, EdgeType } from "./types";

export const NODE_CONFIG: Record<
  NodeType,
  { color: string; size: number; label: string; priority: number }
> = {
  organization: { color: "#f59e0b", size: 24, label: "Organization", priority: 9 },
  user:         { color: "#3b82f6", size: 16, label: "User",         priority: 8 },
  channel:      { color: "#8b5cf6", size: 14, label: "Channel",      priority: 7 },
  meeting:      { color: "#f43f5e", size: 12, label: "Meeting",      priority: 6 },
  contact:      { color: "#10b981", size: 10, label: "Contact",      priority: 5 },
  insight:      { color: "#eab308", size: 8,  label: "Insight",      priority: 4 },
  task:         { color: "#06b6d4", size: 8,  label: "Task",         priority: 3 },
  context:      { color: "#a855f7", size: 6,  label: "Context",      priority: 2 },
  message:      { color: "#64748b", size: 4,  label: "Message",      priority: 1 },
};

export const EDGE_CONFIG: Record<
  EdgeType,
  { color: string; width: number; label: string }
> = {
  MEMBER_OF:    { color: "rgba(59,130,246,0.3)",   width: 2,   label: "Member Of" },
  HAS_CHANNEL:  { color: "rgba(139,92,246,0.3)",   width: 2,   label: "Has Channel" },
  POSTED_IN:    { color: "rgba(100,116,139,0.15)", width: 0.5, label: "Posted In" },
  AUTHORED_BY:  { color: "rgba(59,130,246,0.2)",   width: 1,   label: "Authored By" },
  REPLIES_TO:   { color: "rgba(249,115,22,0.3)",   width: 1.5, label: "Replies To" },
  IN_ORG:       { color: "rgba(245,158,11,0.15)",  width: 0.5, label: "In Org" },
  REPORTS_TO:   { color: "rgba(16,185,129,0.4)",   width: 2,   label: "Reports To" },
  FROM_MEETING: { color: "rgba(244,63,94,0.3)",    width: 1.5, label: "From Meeting" },
  FROM_INSIGHT: { color: "rgba(234,179,8,0.3)",    width: 1.5, label: "From Insight" },
  MENTIONS:     { color: "rgba(168,85,247,0.4)",   width: 2,   label: "Mentions" },
  READ_BY:         { color: "rgba(100,116,139,0.1)",  width: 0.3, label: "Read By" },
  ASSIGNED_TO:     { color: "rgba(6,182,212,0.5)",    width: 2,   label: "Assigned To" },
  OWNED_BY:        { color: "rgba(234,179,8,0.5)",    width: 2,   label: "Owned By" },
  PARTICIPATED_IN: { color: "rgba(244,63,94,0.5)",    width: 2,   label: "Participated In" },
};

export const CANVAS_BG = "#0f172a";

export const DEFAULT_MESSAGE_LIMIT = 100;

export const ALL_NODE_TYPES: NodeType[] = [
  "organization", "user", "channel", "meeting", "contact",
  "insight", "task", "context", "message",
];

// Messages OFF by default (too many for force graph)
export const DEFAULT_ENABLED_TYPES = new Set<NodeType>([
  "organization", "user", "channel", "contact",
  "meeting", "insight", "task", "context",
]);
