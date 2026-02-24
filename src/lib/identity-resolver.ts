/**
 * Identity Resolution — merges duplicate profiles and contact↔profile overlaps
 * into canonical person nodes before graph construction.
 *
 * Problem: The same person can appear as:
 *   - 2+ User nodes (duplicate profile rows with different UUIDs)
 *   - Both a User node AND a Contact node (same person in both tables)
 *
 * Solution: Union-Find clustering on normalized names, emails, and aliases.
 * Each cluster elects one canonical person with merged properties.
 */

import { NodeType } from "./types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PersonRecord {
  sourceType: "user" | "contact";
  uuid: string;
  name: string | null;
  email: string | null;
  aliases: string[];
  properties: Record<string, unknown>;
}

export interface CanonicalPerson {
  canonicalId: string;                     // "person_<uuid>"
  preferredType: "user" | "contact";       // "user" wins over "contact"
  label: string;
  sourceIds: string[];                     // all original nodeId-style IDs
  profileIds: string[];                    // raw profile UUIDs
  contactIds: string[];                    // raw contact UUIDs
  properties: Record<string, unknown>;     // merged (profile props win)
}

export interface IdentityIndex {
  persons: Map<string, CanonicalPerson>;   // canonicalId → person
  resolve: (text: string) => string | null;
  resolveMulti: (text: string) => string[];
  profileToCanonical: (rawUuid: string) => string | null;
  contactToCanonical: (rawUuid: string) => string | null;
}

/* ------------------------------------------------------------------ */
/*  Non-person blacklist                                               */
/* ------------------------------------------------------------------ */

const NON_PERSON_BLACKLIST = new Set([
  "user",
  "ai assistant",
  "ai",
  "native",
  "team",
  "unknown",
  "pacific bay team",
  "openai",
  "peak xv",
  "system",
  "assistant",
  "none",
  "n/a",
  "tbd",
]);

/* ------------------------------------------------------------------ */
/*  Union-Find (Disjoint Set)                                          */
/* ------------------------------------------------------------------ */

class UnionFind {
  private parent: Map<number, number> = new Map();
  private rank: Map<number, number> = new Map();

  makeSet(x: number): void {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
  }

  find(x: number): number {
    let root = x;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    // Path compression
    let curr = x;
    while (curr !== root) {
      const next = this.parent.get(curr)!;
      this.parent.set(curr, root);
      curr = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    const rankA = this.rank.get(ra)!;
    const rankB = this.rank.get(rb)!;
    if (rankA < rankB) {
      this.parent.set(ra, rb);
    } else if (rankA > rankB) {
      this.parent.set(rb, ra);
    } else {
      this.parent.set(rb, ra);
      this.rank.set(ra, rankA + 1);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

const HONORIFICS = ["sir ", "mr ", "ms ", "mrs ", "dr ", "mr. ", "ms. ", "mrs. ", "dr. "];

function stripHonorific(s: string): string | null {
  for (const h of HONORIFICS) {
    if (s.startsWith(h)) return s.slice(h.length);
  }
  return null;
}

function parseAngleBracket(s: string): { name: string; email: string } | null {
  const m = s.match(/^(.+?)\s*<(.+?)>$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return null;
}

/* ------------------------------------------------------------------ */
/*  Main: buildIdentityIndex                                           */
/* ------------------------------------------------------------------ */

export function buildIdentityIndex(
  contacts: Record<string, unknown>[],
  profiles: Record<string, unknown>[],
): IdentityIndex {
  // 1. Collect all person records
  const records: PersonRecord[] = [];

  for (const p of profiles) {
    records.push({
      sourceType: "user",
      uuid: p.id as string,
      name: (p.full_name as string) || null,
      email: null,
      aliases: [],
      properties: {
        role: p.role,
        response_persona: p.response_persona,
        created_at: p.created_at,
      },
    });
  }

  for (const c of contacts) {
    const aliases = Array.isArray(c.aliases)
      ? (c.aliases as string[]).filter((a) => typeof a === "string" && a.trim())
      : [];
    records.push({
      sourceType: "contact",
      uuid: c.id as string,
      name: (c.name as string) || null,
      email: (c.email as string) || null,
      aliases,
      properties: {
        email: c.email,
        role: c.role,
        department: c.department,
        relationship_type: c.relationship_type,
        company_name: c.company_name,
        location: c.location,
        is_primary_contact: c.is_primary_contact,
        tags: c.tags,
        created_at: c.created_at,
      },
    });
  }

  // 2. Build key→record-indices map for clustering
  const keyToIndices = new Map<string, number[]>();

  const addKey = (key: string, idx: number) => {
    const k = normalize(key);
    if (!k || k.length < 2) return;
    const existing = keyToIndices.get(k);
    if (existing) {
      existing.push(idx);
    } else {
      keyToIndices.set(k, [idx]);
    }
  };

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.name) addKey(r.name, i);
    if (r.email) addKey(r.email, i);
    for (const alias of r.aliases) addKey(alias, i);
  }

  // 3. Union-Find clustering: records sharing any key are same person
  const uf = new UnionFind();
  for (let i = 0; i < records.length; i++) uf.makeSet(i);

  for (const indices of keyToIndices.values()) {
    for (let j = 1; j < indices.length; j++) {
      uf.union(indices[0], indices[j]);
    }
  }

  // 4. Group records by cluster root
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < records.length; i++) {
    const root = uf.find(i);
    const group = clusters.get(root);
    if (group) {
      group.push(i);
    } else {
      clusters.set(root, [i]);
    }
  }

  // 5. Elect canonical person per cluster
  const persons = new Map<string, CanonicalPerson>();
  const profileUuidToCanonical = new Map<string, string>();
  const contactUuidToCanonical = new Map<string, string>();
  const lookupMap = new Map<string, string>(); // normalized key → canonicalId

  for (const memberIndices of clusters.values()) {
    const members = memberIndices.map((i) => records[i]);

    // Prefer profiles over contacts
    const profileMembers = members.filter((m) => m.sourceType === "user");
    const contactMembers = members.filter((m) => m.sourceType === "contact");

    const preferredType: NodeType =
      profileMembers.length > 0 ? "user" : "contact";
    const primaryMember =
      profileMembers.length > 0 ? profileMembers[0] : contactMembers[0];

    const canonicalId = `person_${primaryMember.uuid}`;

    // Pick best label: prefer profile name, then contact name, then "(no name)"
    let label = "(no name)";
    for (const m of profileMembers) {
      if (m.name) { label = m.name; break; }
    }
    if (label === "(no name)") {
      for (const m of contactMembers) {
        if (m.name) { label = m.name; break; }
      }
    }

    // Merge properties: profile props first (higher trust), then fill from contacts
    const mergedProps: Record<string, unknown> = {};
    // Start with contact properties (lower precedence)
    for (const m of contactMembers) {
      for (const [k, v] of Object.entries(m.properties)) {
        if (v != null && v !== "") mergedProps[k] = v;
      }
    }
    // Override with profile properties (higher precedence)
    for (const m of profileMembers) {
      for (const [k, v] of Object.entries(m.properties)) {
        if (v != null && v !== "") mergedProps[k] = v;
      }
    }

    const sourceIds: string[] = [];
    const profileIds: string[] = [];
    const contactIds: string[] = [];

    for (const m of members) {
      const sid =
        m.sourceType === "user" ? `user_${m.uuid}` : `contact_${m.uuid}`;
      sourceIds.push(sid);
      if (m.sourceType === "user") profileIds.push(m.uuid);
      else contactIds.push(m.uuid);
    }

    const person: CanonicalPerson = {
      canonicalId,
      preferredType: preferredType as "user" | "contact",
      label,
      sourceIds,
      profileIds,
      contactIds,
      properties: mergedProps,
    };

    persons.set(canonicalId, person);

    // Map raw UUIDs → canonical
    for (const pid of profileIds) profileUuidToCanonical.set(pid, canonicalId);
    for (const cid of contactIds) contactUuidToCanonical.set(cid, canonicalId);

    // Index all keys for lookup
    for (const m of members) {
      if (m.name) lookupMap.set(normalize(m.name), canonicalId);
      if (m.email) lookupMap.set(normalize(m.email), canonicalId);
      for (const alias of m.aliases) {
        lookupMap.set(normalize(alias), canonicalId);
      }
    }
  }

  // 6. Build first-name fallback index
  const firstNameIndex = new Map<string, string | null>();
  for (const person of persons.values()) {
    if (!person.label || person.label === "(no name)") continue;
    const firstName = normalize(person.label).split(/\s+/)[0];
    if (!firstName || firstName.length < 2) continue;
    // Skip if already in the main lookup (exact match handles it)
    if (lookupMap.has(firstName)) continue;
    if (firstNameIndex.has(firstName)) {
      // Ambiguous — two+ people share this first name
      firstNameIndex.set(firstName, null);
    } else {
      firstNameIndex.set(firstName, person.canonicalId);
    }
  }

  // 7. Build resolution functions

  function isBlacklisted(text: string): boolean {
    return NON_PERSON_BLACKLIST.has(normalize(text));
  }

  function resolve(text: string): string | null {
    if (typeof text !== "string" || !text.trim()) return null;
    const norm = normalize(text);

    // Blacklist check
    if (NON_PERSON_BLACKLIST.has(norm)) return null;

    // Exact lookup
    const exact = lookupMap.get(norm);
    if (exact) return exact;

    // "Name <email>" format
    const angle = parseAngleBracket(norm);
    if (angle) {
      const byName = lookupMap.get(angle.name);
      if (byName) return byName;
      const byEmail = lookupMap.get(angle.email);
      if (byEmail) return byEmail;
    }

    // Honorific stripping
    const stripped = stripHonorific(norm);
    if (stripped) {
      const byStripped = lookupMap.get(stripped);
      if (byStripped) return byStripped;
    }

    // First-name fallback (only if unambiguous)
    const firstName = norm.split(/\s+/)[0];
    if (firstName && firstName.length >= 2) {
      const byFirst = firstNameIndex.get(firstName);
      if (byFirst) return byFirst; // null means ambiguous, so won't return
    }

    return null;
  }

  function resolveMulti(text: string): string[] {
    if (typeof text !== "string" || !text.trim()) return [];

    // Split on ", " and " and " (case-insensitive)
    const fragments = text
      .split(/,\s*|\s+and\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);

    // Single fragment — resolve directly (avoids splitting names like "Jasminder Singh Gulati")
    if (fragments.length <= 1) {
      const id = resolve(text);
      return id ? [id] : [];
    }

    const results: string[] = [];
    const seen = new Set<string>();
    for (const fragment of fragments) {
      const id = resolve(fragment);
      if (id && !seen.has(id)) {
        seen.add(id);
        results.push(id);
      }
    }
    return results;
  }

  return {
    persons,
    resolve,
    resolveMulti,
    profileToCanonical: (rawUuid: string) =>
      profileUuidToCanonical.get(rawUuid) ?? null,
    contactToCanonical: (rawUuid: string) =>
      contactUuidToCanonical.get(rawUuid) ?? null,
  };
}
