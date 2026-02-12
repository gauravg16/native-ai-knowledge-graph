import {
  GraphNode,
  GraphLink,
  GraphData,
  AdjacencyIndex,
  AdjacencyEntry,
  NeighborInfo,
  ChainStats,
} from "./types";

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
