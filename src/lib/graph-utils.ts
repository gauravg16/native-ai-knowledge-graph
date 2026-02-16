import {
  GraphNode,
  GraphLink,
  GraphData,
  AdjacencyIndex,
  AdjacencyEntry,
  NeighborInfo,
  ChainStats,
  EdgeType,
  GraphFilterState,
  TimeRange,
} from "./types";
import { NODE_CONFIG } from "./constants";

// --- Adjacency Index ---

export function buildAdjacencyIndex(data: GraphData): AdjacencyIndex {
  const index: AdjacencyIndex = new Map();

  for (const node of data.nodes) {
    index.set(node.id, { neighbors: new Set(), links: [] });
  }

  for (const link of data.links) {
    const sourceId =
      typeof link.source === "string" ? link.source : link.source?.id;
    const targetId =
      typeof link.target === "string" ? link.target : link.target?.id;
    if (!sourceId || !targetId) continue;

    const sourceEntry = index.get(sourceId);
    const targetEntry = index.get(targetId);

    if (sourceEntry) {
      sourceEntry.neighbors.add(targetId);
      sourceEntry.links.push(link);
    }
    if (targetEntry) {
      targetEntry.neighbors.add(sourceId);
      targetEntry.links.push(link);
    }
  }

  return index;
}

// --- Get Neighbors ---

export function getNeighbors(
  nodeId: string,
  data: GraphData,
  adjacency: AdjacencyIndex,
): NeighborInfo[] {
  const entry = adjacency.get(nodeId);
  if (!entry) return [];

  const nodeMap = new Map(data.nodes.map((n) => [n.id, n]));
  const results: NeighborInfo[] = [];

  for (const link of entry.links) {
    const sourceId =
      typeof link.source === "string" ? link.source : link.source?.id;
    const targetId =
      typeof link.target === "string" ? link.target : link.target?.id;

    if (sourceId === nodeId && targetId) {
      const targetNode = nodeMap.get(targetId);
      if (targetNode)
        results.push({ node: targetNode, link, direction: "outgoing" });
    } else if (targetId === nodeId && sourceId) {
      const sourceNode = nodeMap.get(sourceId);
      if (sourceNode)
        results.push({ node: sourceNode, link, direction: "incoming" });
    }
  }

  return results;
}

// --- BFS Shortest Path ---

export function bfsShortestPath(
  startId: string,
  endId: string,
  adjacency: AdjacencyIndex,
): string[] | null {
  if (startId === endId) return [startId];

  const visited = new Set<string>([startId]);
  const parent = new Map<string, string>();
  const queue: string[] = [startId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const entry = adjacency.get(current);
    if (!entry) continue;

    for (const neighborId of entry.neighbors) {
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);
      parent.set(neighborId, current);

      if (neighborId === endId) {
        const path: string[] = [endId];
        let node = endId;
        while (parent.has(node)) {
          node = parent.get(node)!;
          path.unshift(node);
        }
        return path;
      }

      queue.push(neighborId);
    }
  }

  return null;
}

// --- Fuzzy Search ---

export function fuzzyMatchNodes(
  query: string,
  nodes: GraphNode[],
  maxResults: number = 12,
): GraphNode[] {
  if (!query.trim()) return [];
  const lower = query.toLowerCase();

  const scored = nodes.map((node) => {
    const label = node.label.toLowerCase();
    let score = 0;
    if (label === lower) score = 100;
    else if (label.startsWith(lower)) score = 80;
    else if (label.includes(lower)) score = 60;
    else {
      const props = Object.values(node.properties || {});
      for (const val of props) {
        if (typeof val === "string" && val.toLowerCase().includes(lower)) {
          score = 30;
          break;
        }
      }
    }
    return { node, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((s) => s.node);
}

// --- Most Connected Node ---

export function getMostConnected(
  adjacency: AdjacencyIndex,
  data: GraphData,
): GraphNode | null {
  let maxCount = 0;
  let maxId: string | null = null;

  for (const [id, entry] of adjacency) {
    if (entry.neighbors.size > maxCount) {
      maxCount = entry.neighbors.size;
      maxId = id;
    }
  }

  if (!maxId) return null;
  return data.nodes.find((n) => n.id === maxId) || null;
}

// --- Intelligence Chain Stats ---

export function getIntelligenceChainStats(data: GraphData): ChainStats {
  let meetingToInsightEdges = 0;
  let insightToTaskEdges = 0;

  for (const link of data.links) {
    const linkType =
      typeof link.type === "string" ? link.type : "";
    if (linkType === "FROM_MEETING") meetingToInsightEdges++;
    if (linkType === "FROM_INSIGHT") insightToTaskEdges++;
  }

  const byType = { meeting: 0, insight: 0, task: 0 };
  for (const node of data.nodes) {
    if (node.type in byType) byType[node.type as keyof typeof byType]++;
  }

  return {
    meetingCount: byType.meeting,
    insightCount: byType.insight,
    taskCount: byType.task,
    meetingToInsightEdges,
    insightToTaskEdges,
  };
}

// --- Link Key Helper ---

export function getLinkKey(link: GraphLink): string {
  const src =
    typeof link.source === "string" ? link.source : link.source?.id;
  const tgt =
    typeof link.target === "string" ? link.target : link.target?.id;
  return `${src}__${tgt}`;
}

// --- V2 Filter Pipeline ---

const TIME_RANGE_DAYS: Record<TimeRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "all": 0,
};

function linkId(link: GraphLink): { src: string; tgt: string } {
  const src = typeof link.source === "string" ? link.source : link.source?.id;
  const tgt = typeof link.target === "string" ? link.target : link.target?.id;
  return { src: src || "", tgt: tgt || "" };
}

function filterByTimeRange(data: GraphData, timeRange: TimeRange): GraphData {
  if (timeRange === "all") return data;

  const days = TIME_RANGE_DAYS[timeRange];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffISO = cutoff.toISOString();

  const kept = new Set<string>();
  const nodes = data.nodes.filter((n) => {
    // Always keep org node
    if (n.type === "organization") { kept.add(n.id); return true; }
    const createdAt = n.properties.created_at;
    if (typeof createdAt === "string" && createdAt >= cutoffISO) {
      kept.add(n.id);
      return true;
    }
    return false;
  });

  const links = data.links.filter((l) => {
    const { src, tgt } = linkId(l);
    return kept.has(src) && kept.has(tgt);
  });

  return { nodes, links };
}

function filterByEdgeTypes(data: GraphData, enabledEdgeTypes: Set<EdgeType>): GraphData {
  const links = data.links.filter((l) => enabledEdgeTypes.has(l.type));
  return { nodes: data.nodes, links };
}

function removeOrphans(data: GraphData): GraphData {
  const connected = new Set<string>();
  for (const l of data.links) {
    const { src, tgt } = linkId(l);
    connected.add(src);
    connected.add(tgt);
  }

  const nodes = data.nodes.filter(
    (n) => n.type === "organization" || connected.has(n.id),
  );
  return { nodes, links: data.links };
}

function applyDynamicSizing(data: GraphData, adjacency: AdjacencyIndex): GraphData {
  const nodes = data.nodes.map((n) => {
    const degree = adjacency.get(n.id)?.neighbors.size ?? 0;
    const baseSize = NODE_CONFIG[n.type].size;
    const scaled = baseSize * (1 + Math.log2(degree + 1) * 0.4);
    // Clamp: minimum 3, maximum 60
    const val = Math.max(3, Math.min(60, scaled));
    return { ...n, val };
  });
  return { nodes, links: data.links };
}

export interface FilteredGraphResult {
  data: GraphData;
  adjacency: AdjacencyIndex;
}

export function applyGraphFilters(
  rawData: GraphData,
  filters: GraphFilterState,
): FilteredGraphResult {
  let data = filterByTimeRange(rawData, filters.timeRange);
  data = filterByEdgeTypes(data, filters.enabledEdgeTypes);
  if (filters.hideOrphans) {
    data = removeOrphans(data);
  }
  const adjacency = buildAdjacencyIndex(data);
  data = applyDynamicSizing(data, adjacency);
  return { data, adjacency };
}

// --- Actionable Insights ---

export interface ActionableInsights {
  topAssignee: { label: string; count: number } | null;
  unassignedTasks: number;
  disconnectedContacts: number;
  insightConcentration: { topOwners: number; percentage: number } | null;
}

export function computeActionableInsights(
  data: GraphData,
  adjacency: AdjacencyIndex,
): ActionableInsights {
  // Top assignee: person with most incoming ASSIGNED_TO edges
  const assigneeCounts = new Map<string, number>();
  for (const l of data.links) {
    if (l.type === "ASSIGNED_TO") {
      const { tgt } = linkId(l);
      assigneeCounts.set(tgt, (assigneeCounts.get(tgt) || 0) + 1);
    }
  }
  let topAssignee: ActionableInsights["topAssignee"] = null;
  if (assigneeCounts.size > 0) {
    let maxId = "";
    let maxCount = 0;
    for (const [id, count] of assigneeCounts) {
      if (count > maxCount) { maxCount = count; maxId = id; }
    }
    const node = data.nodes.find((n) => n.id === maxId);
    if (node) topAssignee = { label: node.label, count: maxCount };
  }

  // Unassigned tasks: task nodes with no ASSIGNED_TO outgoing edge
  const tasksWithAssignee = new Set<string>();
  for (const l of data.links) {
    if (l.type === "ASSIGNED_TO") {
      const { src } = linkId(l);
      tasksWithAssignee.add(src);
    }
  }
  const unassignedTasks = data.nodes.filter(
    (n) => n.type === "task" && !tasksWithAssignee.has(n.id),
  ).length;

  // Disconnected contacts: contact nodes with degree 0
  const disconnectedContacts = data.nodes.filter(
    (n) => n.type === "contact" && (adjacency.get(n.id)?.neighbors.size ?? 0) === 0,
  ).length;

  // Insight concentration: top-3 owners' share of total OWNED_BY edges
  const ownerCounts = new Map<string, number>();
  let totalOwnedBy = 0;
  for (const l of data.links) {
    if (l.type === "OWNED_BY") {
      const { tgt } = linkId(l);
      ownerCounts.set(tgt, (ownerCounts.get(tgt) || 0) + 1);
      totalOwnedBy++;
    }
  }
  let insightConcentration: ActionableInsights["insightConcentration"] = null;
  if (totalOwnedBy > 0) {
    const sorted = [...ownerCounts.values()].sort((a, b) => b - a);
    const topN = Math.min(3, sorted.length);
    const topSum = sorted.slice(0, topN).reduce((a, b) => a + b, 0);
    const percentage = Math.round((topSum / totalOwnedBy) * 100);
    insightConcentration = { topOwners: topN, percentage };
  }

  return { topAssignee, unassignedTasks, disconnectedContacts, insightConcentration };
}
