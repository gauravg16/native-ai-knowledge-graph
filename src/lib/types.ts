export type NodeType =
  | "organization"
  | "user"
  | "channel"
  | "message"
  | "contact"
  | "meeting"
  | "insight"
  | "task"
  | "context";

export type EdgeType =
  | "MEMBER_OF"
  | "HAS_CHANNEL"
  | "POSTED_IN"
  | "AUTHORED_BY"
  | "REPLIES_TO"
  | "IN_ORG"
  | "REPORTS_TO"
  | "FROM_MEETING"
  | "FROM_INSIGHT"
  | "MENTIONS"
  | "READ_BY"
  | "ASSIGNED_TO"
  | "OWNED_BY"
  | "PARTICIPATED_IN";

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  properties: Record<string, unknown>;
  val?: number;
  color?: string;
  // force-graph adds these at runtime
  x?: number;
  y?: number;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: EdgeType;
  color?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface GraphStats {
  totalNodes: number;
  totalLinks: number;
  byType: Record<NodeType, number>;
  orgName: string;
  edgeCounts: Record<EdgeType, number>;
}

export interface GraphResponse {
  data: GraphData;
  stats: GraphStats;
  fetchedAt: string;
}

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  counts: Record<string, number>;
  total: number;
}

// V1 interaction types

export type InteractionMode = "explore" | "focus" | "pathfinding";

export interface FocusState {
  nodeId: string;
  neighborIds: Set<string>;
  linkKeys: Set<string>;
}

export interface PathState {
  startNodeId: string | null;
  endNodeId: string | null;
  path: string[] | null;
  pathLinkKeys: Set<string>;
}

export interface NeighborInfo {
  node: GraphNode;
  link: GraphLink;
  direction: "outgoing" | "incoming";
}

export interface AdjacencyEntry {
  neighbors: Set<string>;
  links: GraphLink[];
}

export type AdjacencyIndex = Map<string, AdjacencyEntry>;

export interface ChainStats {
  meetingCount: number;
  insightCount: number;
  taskCount: number;
  meetingToInsightEdges: number;
  insightToTaskEdges: number;
}

// V2 filter types

export type TimeRange = "7d" | "30d" | "90d" | "all";

export interface GraphFilterState {
  enabledEdgeTypes: Set<EdgeType>;
  hideOrphans: boolean;
  timeRange: TimeRange;
}

// V3 analytics types

export interface PipelineScorecard {
  meetingToInsightRate: number;   // 0.0–1.0
  insightToTaskRate: number;      // 0.0–1.0
  endToEndYield: number;          // 0.0–1.0 (meetings that yielded tasks)
  taskCompletionRate: number;     // 0.0–1.0
  overdueTasks: number;
  deadEndMeetings: number;        // meetings with 0 insights
  staleInsights: number;          // high-confidence, >30d old, no task
  totalMeetings: number;
  totalInsights: number;
  totalTasks: number;
}

export interface PersonWorkload {
  nodeId: string;
  label: string;
  type: "user" | "contact";
  totalTasks: number;
  openTasks: number;
  overdueTasks: number;
  completedTasks: number;
  insightsOwned: number;
  meetingsAttended: number;
  workloadScore: number;
  taskCompletionRate: number;     // 0.0–1.0
}

export interface AttentionItem {
  id: string;
  severity: "critical" | "warning" | "info";
  category: string;
  message: string;
  relatedNodeIds: string[];
}
