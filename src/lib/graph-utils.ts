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
  PipelineScorecard,
  PersonWorkload,
  AttentionItem,
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
//
// CRITICAL: force-graph tracks positions (x, y, vx, vy) by mutating node
// objects directly. If we create new objects (via spread or map), those
// position properties are lost and the simulation restarts from scratch.
//
// Therefore: the pipeline FILTERS arrays (subset of same object refs) and
// MUTATES node.val in place. Never spread-copy nodes.

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

export interface FilteredGraphResult {
  data: GraphData;
  adjacency: AdjacencyIndex;
}

export function applyGraphFilters(
  rawData: GraphData,
  filters: GraphFilterState,
): FilteredGraphResult {
  // 1. Determine which nodes pass the time filter
  let timeKept: Set<string> | null = null; // null = all pass
  if (filters.timeRange !== "all") {
    const days = TIME_RANGE_DAYS[filters.timeRange];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffISO = cutoff.toISOString();
    timeKept = new Set<string>();
    for (const n of rawData.nodes) {
      if (n.type === "organization") { timeKept.add(n.id); continue; }
      const createdAt = n.properties.created_at;
      if (typeof createdAt === "string" && createdAt >= cutoffISO) {
        timeKept.add(n.id);
      }
    }
  }

  // 2. Filter links: must pass edge-type filter AND both endpoints pass time filter
  const links = rawData.links.filter((l) => {
    if (!filters.enabledEdgeTypes.has(l.type)) return false;
    if (timeKept) {
      const { src, tgt } = linkId(l);
      if (!timeKept.has(src) || !timeKept.has(tgt)) return false;
    }
    return true;
  });

  // 3. If hiding orphans, compute connected set from surviving links
  let connected: Set<string> | null = null;
  if (filters.hideOrphans) {
    connected = new Set<string>();
    for (const l of links) {
      const { src, tgt } = linkId(l);
      connected.add(src);
      connected.add(tgt);
    }
  }

  // 4. Build final node array — SAME object references from rawData
  const nodes = rawData.nodes.filter((n) => {
    if (timeKept && !timeKept.has(n.id)) return false;
    if (connected && n.type !== "organization" && !connected.has(n.id)) return false;
    return true;
  });

  const data: GraphData = { nodes, links };
  const adjacency = buildAdjacencyIndex(data);

  // 5. Dynamic sizing — MUTATE val in place (preserves force-graph x/y positions)
  for (const n of nodes) {
    const degree = adjacency.get(n.id)?.neighbors.size ?? 0;
    const baseSize = NODE_CONFIG[n.type].size;
    const scaled = baseSize * (1 + Math.log2(degree + 1) * 0.5);
    n.val = Math.max(3, Math.min(80, scaled));
    // Store degree for rendering (hub borders, charge force)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (n as any).__degree = degree;
  }

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

/* ------------------------------------------------------------------ */
/*  V3 Analytics: Pipeline Scorecard                                   */
/* ------------------------------------------------------------------ */

export function computePipelineScorecard(
  data: GraphData,
  adjacency: AdjacencyIndex,
): PipelineScorecard {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Collect nodes by type
  const meetings: GraphNode[] = [];
  const insights: GraphNode[] = [];
  const tasks: GraphNode[] = [];
  for (const n of data.nodes) {
    if (n.type === "meeting") meetings.push(n);
    else if (n.type === "insight") insights.push(n);
    else if (n.type === "task") tasks.push(n);
  }

  // Build reverse edge maps: "which meetings have insights?", "which insights have tasks?"
  const meetingsWithInsight = new Set<string>();
  const insightsWithTask = new Set<string>();
  for (const l of data.links) {
    const { src, tgt } = linkId(l);
    // FROM_MEETING: insight → meeting (source=insight, target=meeting)
    if (l.type === "FROM_MEETING") meetingsWithInsight.add(tgt);
    // FROM_INSIGHT: task → insight (source=task, target=insight)
    if (l.type === "FROM_INSIGHT") insightsWithTask.add(tgt);
  }

  // End-to-end: meetings whose insights have at least one task
  // Walk: meeting ← FROM_MEETING ← insight ← FROM_INSIGHT ← task
  const meetingsWithTask = new Set<string>();
  for (const l of data.links) {
    if (l.type === "FROM_MEETING") {
      const insightId = linkId(l).src;
      const meetingId = linkId(l).tgt;
      if (insightsWithTask.has(insightId)) meetingsWithTask.add(meetingId);
    }
  }

  // Task metrics
  let completedCount = 0;
  let overdueCount = 0;
  for (const t of tasks) {
    const state = ((t.properties.state as string) || "").toLowerCase();
    if (state === "done" || state === "completed") {
      completedCount++;
    } else {
      const dueAt = t.properties.due_at as string;
      if (dueAt && new Date(dueAt) < now) overdueCount++;
    }
  }

  // Stale insights: confidence >= 0.8, >30d old, no task
  let staleCount = 0;
  for (const ins of insights) {
    const conf = typeof ins.properties.confidence === "number" ? ins.properties.confidence : 0;
    const createdAt = ins.properties.created_at as string;
    if (
      conf >= 0.8 &&
      createdAt && new Date(createdAt) < thirtyDaysAgo &&
      !insightsWithTask.has(ins.id)
    ) {
      staleCount++;
    }
  }

  const totalM = meetings.length;
  const totalI = insights.length;
  const totalT = tasks.length;

  return {
    meetingToInsightRate: totalM > 0 ? meetingsWithInsight.size / totalM : 0,
    insightToTaskRate: totalI > 0 ? insightsWithTask.size / totalI : 0,
    endToEndYield: totalM > 0 ? meetingsWithTask.size / totalM : 0,
    taskCompletionRate: totalT > 0 ? completedCount / totalT : 0,
    overdueTasks: overdueCount,
    deadEndMeetings: totalM - meetingsWithInsight.size,
    staleInsights: staleCount,
    totalMeetings: totalM,
    totalInsights: totalI,
    totalTasks: totalT,
  };
}

/* ------------------------------------------------------------------ */
/*  V3 Analytics: Person Workloads                                     */
/* ------------------------------------------------------------------ */

export function computePersonWorkloads(
  data: GraphData,
  adjacency: AdjacencyIndex,
): PersonWorkload[] {
  const now = new Date();

  // Initialize workload map for all person nodes
  const wMap = new Map<string, PersonWorkload>();
  for (const n of data.nodes) {
    if (n.type === "user" || n.type === "contact") {
      wMap.set(n.id, {
        nodeId: n.id,
        label: n.label,
        type: n.type as "user" | "contact",
        totalTasks: 0,
        openTasks: 0,
        overdueTasks: 0,
        completedTasks: 0,
        insightsOwned: 0,
        meetingsAttended: 0,
        workloadScore: 0,
        taskCompletionRate: 0,
      });
    }
  }

  // Build node lookup for task properties
  const nodeMap = new Map(data.nodes.map((n) => [n.id, n]));

  // Walk all links
  for (const l of data.links) {
    const { src, tgt } = linkId(l);

    if (l.type === "ASSIGNED_TO") {
      // src=task, tgt=person
      const w = wMap.get(tgt);
      if (!w) continue;
      w.totalTasks++;
      const taskNode = nodeMap.get(src);
      if (taskNode) {
        const state = ((taskNode.properties.state as string) || "").toLowerCase();
        if (state === "done" || state === "completed") {
          w.completedTasks++;
        } else {
          w.openTasks++;
          const dueAt = taskNode.properties.due_at as string;
          if (dueAt && new Date(dueAt) < now) w.overdueTasks++;
        }
      }
    } else if (l.type === "OWNED_BY") {
      // src=insight, tgt=person
      const w = wMap.get(tgt);
      if (w) w.insightsOwned++;
    } else if (l.type === "PARTICIPATED_IN") {
      // src=person, tgt=meeting
      const w = wMap.get(src);
      if (w) w.meetingsAttended++;
    }
  }

  // Compute scores
  const results: PersonWorkload[] = [];
  for (const w of wMap.values()) {
    // Only include people with some activity
    if (w.totalTasks === 0 && w.insightsOwned === 0 && w.meetingsAttended === 0) continue;
    w.workloadScore = w.openTasks * 3 + w.overdueTasks * 5 + w.meetingsAttended;
    w.taskCompletionRate = w.totalTasks > 0 ? w.completedTasks / w.totalTasks : 0;
    results.push(w);
  }

  results.sort((a, b) => b.workloadScore - a.workloadScore);
  return results;
}

/* ------------------------------------------------------------------ */
/*  V3 Analytics: Attention Queue                                      */
/* ------------------------------------------------------------------ */

export function computeAttentionQueue(
  data: GraphData,
  adjacency: AdjacencyIndex,
  scorecard: PipelineScorecard,
  workloads: PersonWorkload[],
): AttentionItem[] {
  const items: AttentionItem[] = [];

  // 1. Overdue tasks (critical)
  if (scorecard.overdueTasks > 0) {
    const overdueNodes = data.nodes.filter((n) => {
      if (n.type !== "task") return false;
      const state = ((n.properties.state as string) || "").toLowerCase();
      if (state === "done" || state === "completed") return false;
      const dueAt = n.properties.due_at as string;
      return dueAt && new Date(dueAt) < new Date();
    });
    // Find highest priority overdue task
    const priorityOrder = ["urgent", "high", "medium", "low", "none"];
    overdueNodes.sort((a, b) => {
      const pa = priorityOrder.indexOf(((a.properties.priority as string) || "none").toLowerCase());
      const pb = priorityOrder.indexOf(((b.properties.priority as string) || "none").toLowerCase());
      return pa - pb;
    });
    const top = overdueNodes[0];
    items.push({
      id: "overdue-tasks",
      severity: "critical",
      category: "Overdue Tasks",
      message: `${scorecard.overdueTasks} task${scorecard.overdueTasks !== 1 ? "s" : ""} overdue${top ? `. Highest: "${top.label}"` : ""}`,
      relatedNodeIds: overdueNodes.map((n) => n.id),
    });
  }

  // 2. Unassigned high-priority tasks (critical)
  const tasksWithAssignee = new Set<string>();
  for (const l of data.links) {
    if (l.type === "ASSIGNED_TO") tasksWithAssignee.add(linkId(l).src);
  }
  const unassignedUrgent = data.nodes.filter((n) => {
    if (n.type !== "task" || tasksWithAssignee.has(n.id)) return false;
    const p = ((n.properties.priority as string) || "none").toLowerCase();
    return p === "urgent" || p === "high";
  });
  if (unassignedUrgent.length > 0) {
    items.push({
      id: "unassigned-urgent",
      severity: "critical",
      category: "Unassigned",
      message: `${unassignedUrgent.length} high-priority task${unassignedUrgent.length !== 1 ? "s" : ""} have no assignee`,
      relatedNodeIds: unassignedUrgent.map((n) => n.id),
    });
  }

  // 3. Person bottleneck (warning) — top person with >=3 overdue
  const bottleneck = workloads.find((w) => w.overdueTasks >= 3);
  if (bottleneck) {
    items.push({
      id: "bottleneck-person",
      severity: "warning",
      category: "Bottleneck",
      message: `${bottleneck.label} has ${bottleneck.openTasks} open tasks (${bottleneck.overdueTasks} overdue)`,
      relatedNodeIds: [bottleneck.nodeId],
    });
  }

  // 4. Stale high-confidence insights (warning)
  if (scorecard.staleInsights > 0) {
    const staleNodes = data.nodes.filter((n) => {
      if (n.type !== "insight") return false;
      const conf = typeof n.properties.confidence === "number" ? n.properties.confidence : 0;
      const createdAt = n.properties.created_at as string;
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return conf >= 0.8 && createdAt && new Date(createdAt) < thirtyDaysAgo;
    });
    items.push({
      id: "stale-insights",
      severity: "warning",
      category: "Stale Insights",
      message: `${scorecard.staleInsights} high-confidence insight${scorecard.staleInsights !== 1 ? "s" : ""} with no task (>30 days old)`,
      relatedNodeIds: staleNodes.map((n) => n.id),
    });
  }

  // 5. Dead-end meetings (warning)
  if (scorecard.deadEndMeetings > 0 && scorecard.totalMeetings >= 3) {
    const meetingsWithInsight = new Set<string>();
    for (const l of data.links) {
      if (l.type === "FROM_MEETING") meetingsWithInsight.add(linkId(l).tgt);
    }
    const deadEnds = data.nodes.filter(
      (n) => n.type === "meeting" && !meetingsWithInsight.has(n.id),
    );
    items.push({
      id: "dead-end-meetings",
      severity: "warning",
      category: "Dead-End Meetings",
      message: `${scorecard.deadEndMeetings} meeting${scorecard.deadEndMeetings !== 1 ? "s" : ""} produced zero insights`,
      relatedNodeIds: deadEnds.map((n) => n.id),
    });
  }

  // 6. Low pipeline yield (warning)
  if (scorecard.totalInsights >= 5 && scorecard.insightToTaskRate < 0.25) {
    items.push({
      id: "low-pipeline",
      severity: "warning",
      category: "Low Yield",
      message: `Only ${Math.round(scorecard.insightToTaskRate * 100)}% of insights converted to tasks`,
      relatedNodeIds: [],
    });
  }

  // 7. Disconnected contacts (info)
  const disconnected = data.nodes.filter(
    (n) => n.type === "contact" && (adjacency.get(n.id)?.neighbors.size ?? 0) === 0,
  );
  if (disconnected.length > 0) {
    items.push({
      id: "disconnected-contacts",
      severity: "info",
      category: "Disconnected",
      message: `${disconnected.length} contact${disconnected.length !== 1 ? "s" : ""} with zero connections`,
      relatedNodeIds: disconnected.map((n) => n.id),
    });
  }

  return items;
}

/* ------------------------------------------------------------------ */
/*  V3 Analytics: Node-Level Analytics                                 */
/* ------------------------------------------------------------------ */

export interface PersonAnalytics {
  kind: "person";
  totalTasks: number;
  openTasks: number;
  completedTasks: number;
  overdueTasks: number;
  taskCompletionRate: number;
  insightsOwned: number;
  avgConfidence: number | null;
  meetingsAttended: number;
  workloadVsMedian: number | null; // ratio: 1.0 = median, 1.5 = 50% above
}

export interface MeetingAnalytics {
  kind: "meeting";
  insightsGenerated: number;
  tasksDownstream: number;
  productive: boolean;
  avgInsightsPerMeeting: number;
}

export interface InsightAnalytics {
  kind: "insight";
  actioned: boolean;
  taskCount: number;
  daysToAction: number | null;
  sourceMeeting: { id: string; label: string } | null;
}

export interface TaskAnalytics {
  kind: "task";
  sourceInsight: { id: string; label: string; confidence: number | null } | null;
  sourceMeeting: { id: string; label: string } | null;
}

export type NodeAnalytics =
  | PersonAnalytics
  | MeetingAnalytics
  | InsightAnalytics
  | TaskAnalytics
  | null;

export function computeNodeAnalytics(
  node: GraphNode,
  data: GraphData,
  adjacency: AdjacencyIndex,
  workloads: PersonWorkload[],
): NodeAnalytics {
  const nodeMap = new Map(data.nodes.map((n) => [n.id, n]));
  const entry = adjacency.get(node.id);
  if (!entry) return null;
  const now = new Date();

  if (node.type === "user" || node.type === "contact") {
    const w: PersonAnalytics = {
      kind: "person",
      totalTasks: 0, openTasks: 0, completedTasks: 0, overdueTasks: 0,
      taskCompletionRate: 0, insightsOwned: 0, avgConfidence: null,
      meetingsAttended: 0, workloadVsMedian: null,
    };
    let confSum = 0;
    let confCount = 0;

    for (const l of entry.links) {
      const { src, tgt } = linkId(l);

      if (l.type === "ASSIGNED_TO" && tgt === node.id) {
        w.totalTasks++;
        const task = nodeMap.get(src);
        if (task) {
          const state = ((task.properties.state as string) || "").toLowerCase();
          if (state === "done" || state === "completed") {
            w.completedTasks++;
          } else {
            w.openTasks++;
            const dueAt = task.properties.due_at as string;
            if (dueAt && new Date(dueAt) < now) w.overdueTasks++;
          }
        }
      } else if (l.type === "OWNED_BY" && tgt === node.id) {
        w.insightsOwned++;
        const insight = nodeMap.get(src);
        if (insight && typeof insight.properties.confidence === "number") {
          confSum += insight.properties.confidence;
          confCount++;
        }
      } else if (l.type === "PARTICIPATED_IN" && src === node.id) {
        w.meetingsAttended++;
      }
    }

    w.taskCompletionRate = w.totalTasks > 0 ? w.completedTasks / w.totalTasks : 0;
    w.avgConfidence = confCount > 0 ? confSum / confCount : null;

    // Compare to team median
    if (workloads.length >= 3) {
      const scores = workloads.map((wl) => wl.workloadScore).sort((a, b) => a - b);
      const median = scores[Math.floor(scores.length / 2)];
      const myScore = w.openTasks * 3 + w.overdueTasks * 5 + w.meetingsAttended;
      w.workloadVsMedian = median > 0 ? myScore / median : null;
    }

    return w;
  }

  if (node.type === "meeting") {
    let insightsGenerated = 0;
    const insightIds = new Set<string>();

    for (const l of entry.links) {
      if (l.type === "FROM_MEETING" && linkId(l).tgt === node.id) {
        insightsGenerated++;
        insightIds.add(linkId(l).src);
      }
    }

    // Count downstream tasks from those insights
    let tasksDownstream = 0;
    for (const l of data.links) {
      if (l.type === "FROM_INSIGHT" && insightIds.has(linkId(l).tgt)) {
        tasksDownstream++;
      }
    }

    // Compute average insights per meeting across all meetings
    const totalMeetings = data.nodes.filter((n) => n.type === "meeting").length;
    const totalMeetingEdges = data.links.filter((l) => l.type === "FROM_MEETING").length;
    const avgInsightsPerMeeting = totalMeetings > 0 ? totalMeetingEdges / totalMeetings : 0;

    return {
      kind: "meeting",
      insightsGenerated,
      tasksDownstream,
      productive: insightsGenerated > 0,
      avgInsightsPerMeeting,
    };
  }

  if (node.type === "insight") {
    let taskCount = 0;
    let earliestTaskDate: Date | null = null;
    let sourceMeeting: InsightAnalytics["sourceMeeting"] = null;

    for (const l of entry.links) {
      const { src, tgt } = linkId(l);
      if (l.type === "FROM_INSIGHT" && tgt === node.id) {
        taskCount++;
        const task = nodeMap.get(src);
        if (task) {
          const ca = task.properties.created_at as string;
          if (ca) {
            const d = new Date(ca);
            if (!earliestTaskDate || d < earliestTaskDate) earliestTaskDate = d;
          }
        }
      } else if (l.type === "FROM_MEETING" && src === node.id) {
        const meeting = nodeMap.get(tgt);
        if (meeting) sourceMeeting = { id: meeting.id, label: meeting.label };
      }
    }

    let daysToAction: number | null = null;
    if (earliestTaskDate && node.properties.created_at) {
      const insightDate = new Date(node.properties.created_at as string);
      daysToAction = Math.round(
        (earliestTaskDate.getTime() - insightDate.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (daysToAction < 0) daysToAction = 0;
    }

    return {
      kind: "insight",
      actioned: taskCount > 0,
      taskCount,
      daysToAction,
      sourceMeeting,
    };
  }

  if (node.type === "task") {
    let sourceInsight: TaskAnalytics["sourceInsight"] = null;
    let sourceMeeting: TaskAnalytics["sourceMeeting"] = null;

    // Walk: task → FROM_INSIGHT → insight → FROM_MEETING → meeting
    for (const l of entry.links) {
      if (l.type === "FROM_INSIGHT" && linkId(l).src === node.id) {
        const insight = nodeMap.get(linkId(l).tgt);
        if (insight) {
          sourceInsight = {
            id: insight.id,
            label: insight.label,
            confidence: typeof insight.properties.confidence === "number"
              ? insight.properties.confidence
              : null,
          };
          // Now find that insight's source meeting
          const insightEntry = adjacency.get(insight.id);
          if (insightEntry) {
            for (const il of insightEntry.links) {
              if (il.type === "FROM_MEETING" && linkId(il).src === insight.id) {
                const meeting = nodeMap.get(linkId(il).tgt);
                if (meeting) sourceMeeting = { id: meeting.id, label: meeting.label };
                break;
              }
            }
          }
          break;
        }
      }
    }

    return { kind: "task", sourceInsight, sourceMeeting };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Date formatting utilities                                          */
/* ------------------------------------------------------------------ */

export interface RelativeDate {
  text: string;
  isOverdue: boolean;
}

/**
 * Format an ISO date string as a human-readable relative time.
 * For past dates: "just now", "3 minutes ago", "2 weeks ago", etc.
 * For future dates: "in 3 days", "in 2 weeks", etc.
 * The `isDue` flag treats future as expected and past as overdue.
 */
export function formatRelativeDate(
  iso: string | null | undefined,
  isDue = false,
): RelativeDate | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;

  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const absDiffMs = Math.abs(diffMs);
  const isFuture = diffMs > 0;

  const seconds = Math.floor(absDiffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  let unit: string;
  if (seconds < 60) unit = "just now";
  else if (minutes < 60) unit = `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  else if (hours < 24) unit = `${hours} hour${hours !== 1 ? "s" : ""}`;
  else if (days < 7) unit = `${days} day${days !== 1 ? "s" : ""}`;
  else if (weeks < 5) unit = `${weeks} week${weeks !== 1 ? "s" : ""}`;
  else if (months < 12) unit = `${months} month${months !== 1 ? "s" : ""}`;
  else unit = `${years} year${years !== 1 ? "s" : ""}`;

  let text: string;
  if (unit === "just now") {
    text = "just now";
  } else if (isFuture) {
    text = `in ${unit}`;
  } else {
    text = `${unit} ago`;
  }

  const isOverdue = isDue && !isFuture && seconds > 60;

  return { text, isOverdue };
}

/**
 * Format an ISO date as a short readable string: "Feb 15, 2:30 PM"
 */
export function formatShortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
