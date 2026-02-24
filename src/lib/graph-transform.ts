/**
 * Transforms relational Supabase rows into {nodes, links} graph format.
 * Uses identity-resolver.ts for person deduplication before node creation.
 */

import {
  GraphNode,
  GraphLink,
  GraphStats,
  GraphResponse,
  NodeType,
  EdgeType,
} from "./types";
import { NODE_CONFIG, EDGE_CONFIG } from "./constants";
import { buildIdentityIndex } from "./identity-resolver";
import { deduplicateInsights, deduplicateTasks, deduplicateMeetings } from "./insight-deduplicator";

/* ------------------------------------------------------------------ */
/*  Input type from the API route                                      */
/* ------------------------------------------------------------------ */

export interface TransformInput {
  org: Record<string, unknown> | null;
  profiles: Record<string, unknown>[];
  channels: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  contacts: Record<string, unknown>[];
  meetings: Record<string, unknown>[];
  insights: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  contexts: Record<string, unknown>[];
  mentions: Record<string, unknown>[];
  reads: Record<string, unknown>[];
  enabledTypes: Set<NodeType>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function nodeId(type: NodeType, uuid: string): string {
  return `${type}_${uuid}`;
}

function makeNode(
  id: string,
  type: NodeType,
  label: string,
  properties: Record<string, unknown>,
): GraphNode {
  const cfg = NODE_CONFIG[type];
  return {
    id,
    type,
    label: label || "(unnamed)",
    properties,
    val: cfg.size,
    color: cfg.color,
  };
}

function makeLink(source: string, target: string, type: EdgeType): GraphLink {
  return { source, target, type };
}

function truncate(s: unknown, max: number): string {
  const str = typeof s === "string" ? s : "";
  return str.length > max ? str.slice(0, max) + "..." : str;
}

/* ------------------------------------------------------------------ */
/*  Main transform                                                     */
/* ------------------------------------------------------------------ */

export function transformToGraph(input: TransformInput): GraphResponse {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const ids = new Set<string>();

  const byType: Record<NodeType, number> = {
    organization: 0, user: 0, channel: 0, message: 0, contact: 0,
    meeting: 0, insight: 0, task: 0, context: 0,
  };

  const add = (n: GraphNode) => {
    nodes.push(n);
    ids.add(n.id);
    byType[n.type]++;
  };

  // Deferred links — validated against `ids` at the end.
  const linkDeferred: GraphLink[] = [];
  const deferLink = (src: string, tgt: string, type: EdgeType) => {
    linkDeferred.push(makeLink(src, tgt, type));
  };

  /* --- Organization (always included) --- */
  let orgNid = "";
  if (input.org) {
    const o = input.org;
    orgNid = nodeId("organization", o.id as string);
    add(
      makeNode(orgNid, "organization", o.name as string, {
        slug: o.slug,
        created_at: o.created_at,
        has_brain: o.business_brain_md != null,
      }),
    );
  }

  // Build identity index from ALL contacts + profiles (regardless of enabledTypes)
  const identity = buildIdentityIndex(input.contacts, input.profiles);

  /* --- Person nodes (deduplicated users + contacts) --- */
  const personEnabled =
    input.enabledTypes.has("user") || input.enabledTypes.has("contact");

  if (personEnabled) {
    for (const [canonId, person] of identity.persons) {
      // Filter by the preferred node type toggle
      if (!input.enabledTypes.has(person.preferredType)) continue;

      add(
        makeNode(canonId, person.preferredType, person.label, {
          ...person.properties,
          _merged: person.sourceIds.length > 1,
          _sourceTypes:
            person.profileIds.length > 0 && person.contactIds.length > 0
              ? ["user", "contact"]
              : [person.preferredType],
        }),
      );

      // MEMBER_OF: only for users (profiles)
      if (orgNid && person.preferredType === "user") {
        deferLink(canonId, orgNid, "MEMBER_OF");
      }
    }
  }

  /* --- Channels --- */
  if (input.enabledTypes.has("channel")) {
    for (const ch of input.channels) {
      const chNid = nodeId("channel", ch.id as string);
      add(
        makeNode(chNid, "channel", ch.name as string, {
          type: ch.type,
          description: ch.description,
          member_count: ch.member_count,
          created_at: ch.created_at,
        }),
      );
      if (orgNid) deferLink(chNid, orgNid, "HAS_CHANNEL");
    }
  }

  /* --- Meetings (deduplicated) --- */
  if (input.enabledTypes.has("meeting")) {
    const { meetings: dedupedMeetings, stats: meetingDedupeStats } =
      deduplicateMeetings(input.meetings);

    if (process.env.NODE_ENV === "development") {
      console.log(
        `[meeting-dedup] ${meetingDedupeStats.inputCount} → ${meetingDedupeStats.outputCount} ` +
          `(noise: -${meetingDedupeStats.noiseDropped}, dupes: -${meetingDedupeStats.duplicatesDropped})`,
      );
    }

    for (const m of dedupedMeetings) {
      const parts = Array.isArray(m.participants) ? m.participants : [];
      const mNid = nodeId("meeting", m.id as string);
      add(
        makeNode(mNid, "meeting", (m.title as string) || "(untitled)", {
          platform: m.platform,
          started_at: m.started_at,
          ended_at: m.ended_at,
          participant_count: parts.length,
          participants: parts.join(", "),
          created_at: m.created_at,
        }),
      );
      // Resolve participants → person edges
      for (const participant of parts) {
        const personId = identity.resolve(participant as string);
        if (personId) {
          deferLink(personId, mNid, "PARTICIPATED_IN");
        }
      }
    }
  }

  /* --- Insights (deduplicated) --- */
  if (input.enabledTypes.has("insight")) {
    const { insights: dedupedInsights, stats: dedupeStats } =
      deduplicateInsights(input.insights);

    // Log dedup stats in dev for debugging
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[insight-dedup] ${dedupeStats.inputCount} → ${dedupeStats.outputCount} ` +
          `(noise: -${dedupeStats.noiseDropped}, dupes: -${dedupeStats.duplicatesDropped})`,
      );
    }

    for (const i of dedupedInsights) {
      const iNid = nodeId("insight", i.id as string);
      add(
        makeNode(iNid, "insight", (i.title as string) || "(untitled)", {
          type: i.type,
          summary: truncate(i.summary, 300),
          confidence: i.confidence,
          impact: i.impact,
          owner: i.owner,
          occurrence_count: i.occurrence_count,
          created_at: i.created_at,
        }),
      );
      // Resolve owner text → person edge
      if (i.owner) {
        const personId = identity.resolve(i.owner as string);
        if (personId) {
          deferLink(iNid, personId, "OWNED_BY");
        }
      }
      if (i.meeting_id) {
        deferLink(iNid, nodeId("meeting", i.meeting_id as string), "FROM_MEETING");
      }
    }
  }

  /* --- Tasks (deduplicated) --- */
  if (input.enabledTypes.has("task")) {
    const { tasks: dedupedTasks, stats: taskDedupeStats } =
      deduplicateTasks(input.tasks);

    if (process.env.NODE_ENV === "development") {
      console.log(
        `[task-dedup] ${taskDedupeStats.inputCount} → ${taskDedupeStats.outputCount} ` +
          `(noise: -${taskDedupeStats.noiseDropped}, dupes: -${taskDedupeStats.duplicatesDropped})`,
      );
    }

    for (const t of dedupedTasks) {
      const tNid = nodeId("task", t.id as string);
      add(
        makeNode(tNid, "task", (t.title as string) || "(untitled)", {
          assignee: t.assignee,
          state: t.state,
          priority: t.priority,
          due_at: t.due_at,
          created_at: t.created_at,
        }),
      );
      // Resolve assignee text → person edges (may be multi-person)
      if (t.assignee) {
        for (const personId of identity.resolveMulti(t.assignee as string)) {
          deferLink(tNid, personId, "ASSIGNED_TO");
        }
      }
      if (t.source_insight_id) {
        deferLink(tNid, nodeId("insight", t.source_insight_id as string), "FROM_INSIGHT");
      }
    }
  }

  /* --- Contexts --- */
  if (input.enabledTypes.has("context")) {
    for (const cx of input.contexts) {
      const cxNid = nodeId("context", cx.id as string);
      add(
        makeNode(cxNid, "context", (cx.title as string) || "(untitled)", {
          content_preview: truncate(cx.content, 300),
          tags: cx.tags,
          source_id: cx.source_id,
          created_at: cx.created_at,
        }),
      );
      if (cx.meeting_id) {
        deferLink(cxNid, nodeId("meeting", cx.meeting_id as string), "FROM_MEETING");
      }
    }
  }

  /* --- Messages --- */
  if (input.enabledTypes.has("message")) {
    for (const m of input.messages) {
      const content = (m.content as string) || "";
      const msgNid = nodeId("message", m.id as string);
      add(
        makeNode(msgNid, "message", truncate(content, 60), {
          content_preview: truncate(content, 200),
          is_ai_response: !!m.is_ai_response,
          status: m.status,
          created_at: m.created_at,
          mention_count: m.mention_count,
        }),
      );
      if (m.channel_id) {
        deferLink(msgNid, nodeId("channel", m.channel_id as string), "POSTED_IN");
      }
      // AUTHORED_BY: map raw profile UUID → canonical person ID
      if (m.author_id) {
        const canonAuthor = identity.profileToCanonical(m.author_id as string);
        if (canonAuthor) {
          deferLink(msgNid, canonAuthor, "AUTHORED_BY");
        }
      }
      if (m.reply_to_id) {
        deferLink(msgNid, nodeId("message", m.reply_to_id as string), "REPLIES_TO");
      }
    }
  }

  /* --- Join-table edges: Mentions --- */
  for (const mention of input.mentions) {
    const canonUser = identity.profileToCanonical(
      mention.mentioned_user_id as string,
    );
    if (canonUser) {
      deferLink(
        nodeId("message", mention.message_id as string),
        canonUser,
        "MENTIONS",
      );
    }
  }

  /* --- Join-table edges: Read By --- */
  for (const read of input.reads) {
    const canonUser = identity.profileToCanonical(read.user_id as string);
    if (canonUser) {
      deferLink(
        nodeId("message", read.message_id as string),
        canonUser,
        "READ_BY",
      );
    }
  }

  /* --- Filter out dangling links --- */
  const validLinks = [...links, ...linkDeferred].filter(
    (l) => ids.has(l.source as string) && ids.has(l.target as string),
  );

  /* --- Compute edge counts --- */
  const edgeCounts = {} as Record<EdgeType, number>;
  for (const et of Object.keys(EDGE_CONFIG) as EdgeType[]) {
    edgeCounts[et] = 0;
  }
  for (const l of validLinks) {
    edgeCounts[l.type] = (edgeCounts[l.type] || 0) + 1;
  }

  const stats: GraphStats = {
    totalNodes: nodes.length,
    totalLinks: validLinks.length,
    byType,
    orgName: input.org ? (input.org.name as string) : "Unknown",
    edgeCounts,
  };

  return {
    data: { nodes, links: validLinks },
    stats,
    fetchedAt: new Date().toISOString(),
  };
}
