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
  | "READ_BY";

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
