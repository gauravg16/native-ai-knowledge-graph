/**
 * Transforms relational Supabase rows into {nodes, links} graph format.
 * TypeScript port of kg-mvp/src/transform.py — same logic, same FK validation.
 */

import {
  GraphNode,
  GraphLink,
  GraphData,
  GraphStats,
  GraphResponse,
  NodeType,
  EdgeType,
} from "./types";
import { NODE_CONFIG } from "./constants";

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
  type: NodeType,
  id: string,
  label: string,
  properties: Record<string, unknown>,
): GraphNode {
  const cfg = NODE_CONFIG[type];
  return {
    id: nodeId(type, id),
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
/*  Name Resolver — fuzzy match text fields to contact/profile nodes   */
/* ------------------------------------------------------------------ */

type NameResolver = Map<string, string[]>;

function buildNameResolver(
  contacts: Record<string, unknown>[],
  profiles: Record<string, unknown>[],
): NameResolver {
  const map: NameResolver = new Map();

  const addEntry = (key: string, nodeIdStr: string) => {
    const k = key.trim().toLowerCase();
    if (!k || k.length < 2) return;
    const existing = map.get(k);
    if (existing) {
      if (!existing.includes(nodeIdStr)) existing.push(nodeIdStr);
    } else {
      map.set(k, [nodeIdStr]);
    }
  };

  // Index contacts by name, aliases, email
  for (const c of contacts) {
    const nid = nodeId("contact", c.id as string);
    if (c.name) addEntry(c.name as string, nid);
    if (c.email) addEntry(c.email as string, nid);
    const aliases = Array.isArray(c.aliases) ? c.aliases : [];
    for (const alias of aliases) {
      if (typeof alias === "string") addEntry(alias, nid);
    }
  }

  // Index profiles by full_name
  for (const p of profiles) {
    const nid = nodeId("user", p.id as string);
    if (p.full_name) addEntry(p.full_name as string, nid);
  }

  return map;
}

function resolvePersonText(text: unknown, resolver: NameResolver): string[] {
  if (typeof text !== "string" || !text.trim()) return [];
  const normalized = text.trim().toLowerCase();

  // 1. Exact lookup
  const exact = resolver.get(normalized);
  if (exact) return exact;

  // 2. "Name <email>" format — try name part, then email part
  const angleMatch = normalized.match(/^(.+?)\s*<(.+?)>$/);
  if (angleMatch) {
    const namePart = resolver.get(angleMatch[1].trim());
    if (namePart) return namePart;
    const emailPart = resolver.get(angleMatch[2].trim());
    if (emailPart) return emailPart;
  }

  // 3. Strip honorifics
  const honorifics = ["sir ", "mr ", "ms ", "mrs ", "dr "];
  for (const h of honorifics) {
    if (normalized.startsWith(h)) {
      const stripped = resolver.get(normalized.slice(h.length));
      if (stripped) return stripped;
    }
  }

  // 4. No match (e.g., "Ai Assistant", "User", "Native")
  return [];
}

function resolveMultiPerson(text: unknown, resolver: NameResolver): string[] {
  if (typeof text !== "string" || !text.trim()) return [];

  // Split on ", " and " and " (case-insensitive)
  const fragments = text.split(/,\s*|\s+and\s+/i).map(s => s.trim()).filter(Boolean);

  // If only one fragment, resolve directly (avoids splitting names like "Jasminder Singh Gulati")
  if (fragments.length <= 1) return resolvePersonText(text, resolver);

  const results: string[] = [];
  const seen = new Set<string>();
  for (const fragment of fragments) {
    for (const id of resolvePersonText(fragment, resolver)) {
      if (!seen.has(id)) {
        seen.add(id);
        results.push(id);
      }
    }
  }
  return results;
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

  const link = (src: string, tgt: string, type: EdgeType) => {
    if (ids.has(src) && ids.has(tgt)) {
      links.push(makeLink(src, tgt, type));
    }
  };

  // Helper to safely add a link where we know source exists but target may
  // be added later — we'll filter dangling links at the end.
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
      makeNode("organization", o.id as string, o.name as string, {
        slug: o.slug,
        created_at: o.created_at,
        has_brain: o.business_brain_md != null,
      }),
    );
  }

  // Build name resolver from ALL contacts + profiles (regardless of enabledTypes)
  const resolver = buildNameResolver(input.contacts, input.profiles);

  /* --- Users (profiles) --- */
  if (input.enabledTypes.has("user")) {
    for (const p of input.profiles) {
      add(
        makeNode("user", p.id as string, (p.full_name as string) || "(no name)", {
          role: p.role,
          response_persona: p.response_persona,
          created_at: p.created_at,
        }),
      );
      if (orgNid) deferLink(nodeId("user", p.id as string), orgNid, "MEMBER_OF");
    }
  }

  /* --- Channels --- */
  if (input.enabledTypes.has("channel")) {
    for (const ch of input.channels) {
      add(
        makeNode("channel", ch.id as string, ch.name as string, {
          type: ch.type,
          description: ch.description,
          member_count: ch.member_count,
          created_at: ch.created_at,
        }),
      );
      if (orgNid) deferLink(nodeId("channel", ch.id as string), orgNid, "HAS_CHANNEL");
    }
  }

  /* --- Contacts --- */
  if (input.enabledTypes.has("contact")) {
    for (const c of input.contacts) {
      add(
        makeNode("contact", c.id as string, c.name as string, {
          email: c.email,
          role: c.role,
          department: c.department,
          relationship_type: c.relationship_type,
          company_name: c.company_name,
          location: c.location,
          is_primary_contact: c.is_primary_contact,
          tags: c.tags,
          created_at: c.created_at,
        }),
      );
      if (c.reports_to) {
        deferLink(
          nodeId("contact", c.id as string),
          nodeId("contact", c.reports_to as string),
          "REPORTS_TO",
        );
      }
    }
  }

  /* --- Meetings --- */
  if (input.enabledTypes.has("meeting")) {
    for (const m of input.meetings) {
      const parts = Array.isArray(m.participants) ? m.participants : [];
      add(
        makeNode("meeting", m.id as string, (m.title as string) || "(untitled)", {
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
        for (const personId of resolvePersonText(participant, resolver)) {
          deferLink(personId, nodeId("meeting", m.id as string), "PARTICIPATED_IN");
        }
      }
    }
  }

  /* --- Insights --- */
  if (input.enabledTypes.has("insight")) {
    for (const i of input.insights) {
      add(
        makeNode("insight", i.id as string, (i.title as string) || "(untitled)", {
          type: i.type,
          summary: truncate(i.summary, 300),
          confidence: i.confidence,
          impact: i.impact,
          owner: i.owner,
          occurrence_count: i.occurrence_count,
          created_at: i.created_at,
        }),
      );
      // Resolve owner text → person edges
      if (i.owner) {
        for (const personId of resolvePersonText(i.owner, resolver)) {
          deferLink(nodeId("insight", i.id as string), personId, "OWNED_BY");
        }
      }
      if (i.meeting_id) {
        deferLink(
          nodeId("insight", i.id as string),
          nodeId("meeting", i.meeting_id as string),
          "FROM_MEETING",
        );
      }
    }
  }

  /* --- Tasks --- */
  if (input.enabledTypes.has("task")) {
    for (const t of input.tasks) {
      add(
        makeNode("task", t.id as string, (t.title as string) || "(untitled)", {
          assignee: t.assignee,
          state: t.state,
          priority: t.priority,
          due_at: t.due_at,
          created_at: t.created_at,
        }),
      );
      // Resolve assignee text → person edges
      if (t.assignee) {
        for (const personId of resolveMultiPerson(t.assignee, resolver)) {
          deferLink(nodeId("task", t.id as string), personId, "ASSIGNED_TO");
        }
      }
      if (t.source_insight_id) {
        deferLink(
          nodeId("task", t.id as string),
          nodeId("insight", t.source_insight_id as string),
          "FROM_INSIGHT",
        );
      }
    }
  }

  /* --- Contexts --- */
  if (input.enabledTypes.has("context")) {
    for (const cx of input.contexts) {
      add(
        makeNode("context", cx.id as string, (cx.title as string) || "(untitled)", {
          content_preview: truncate(cx.content, 300),
          tags: cx.tags,
          source_id: cx.source_id,
          created_at: cx.created_at,
        }),
      );
      if (cx.meeting_id) {
        deferLink(
          nodeId("context", cx.id as string),
          nodeId("meeting", cx.meeting_id as string),
          "FROM_MEETING",
        );
      }
    }
  }

  /* --- Messages --- */
  if (input.enabledTypes.has("message")) {
    for (const m of input.messages) {
      const content = (m.content as string) || "";
      add(
        makeNode(
          "message",
          m.id as string,
          truncate(content, 60),
          {
            content_preview: truncate(content, 200),
            is_ai_response: !!m.is_ai_response,
            status: m.status,
            created_at: m.created_at,
            mention_count: m.mention_count,
          },
        ),
      );
      if (m.channel_id) {
        deferLink(
          nodeId("message", m.id as string),
          nodeId("channel", m.channel_id as string),
          "POSTED_IN",
        );
      }
      if (m.author_id) {
        deferLink(
          nodeId("message", m.id as string),
          nodeId("user", m.author_id as string),
          "AUTHORED_BY",
        );
      }
      if (m.reply_to_id) {
        deferLink(
          nodeId("message", m.id as string),
          nodeId("message", m.reply_to_id as string),
          "REPLIES_TO",
        );
      }
    }
  }

  /* --- Join-table edges: Mentions --- */
  for (const mention of input.mentions) {
    deferLink(
      nodeId("message", mention.message_id as string),
      nodeId("user", mention.mentioned_user_id as string),
      "MENTIONS",
    );
  }

  /* --- Join-table edges: Read By --- */
  for (const read of input.reads) {
    deferLink(
      nodeId("message", read.message_id as string),
      nodeId("user", read.user_id as string),
      "READ_BY",
    );
  }

  /* --- Filter out dangling links --- */
  const validLinks = [...links, ...linkDeferred].filter(
    (l) => ids.has(l.source as string) && ids.has(l.target as string),
  );

  const stats: GraphStats = {
    totalNodes: nodes.length,
    totalLinks: validLinks.length,
    byType,
    orgName: input.org ? (input.org.name as string) : "Unknown",
  };

  return {
    data: { nodes, links: validLinks },
    stats,
    fetchedAt: new Date().toISOString(),
  };
}
