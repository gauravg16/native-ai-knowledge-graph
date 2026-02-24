/**
 * Deduplication engine for insights, tasks, and meetings.
 *
 * Shared infrastructure: UnionFind, stem(), extractKeywords(), shouldMerge(),
 * normalizeTitle(), stripDates(), SYNONYMS, STOP_WORDS.
 *
 * Insight dedup — three phases:
 *   1. Noise filter (110+ patterns)
 *   2. Title normalization (synonyms, pronouns, dates)
 *   3. Hierarchical prefix clustering + keyword overlap
 *
 * Task dedup — three phases:
 *   1. Noise filter (assignee-based + title-based)
 *   2. Title normalization (reuses insight infra)
 *   3. Prefix clustering + keyword overlap (reuses insight infra)
 *
 * Meeting dedup — four phases:
 *   1. Noise filter (test meetings, travel, zero-participant deadlines)
 *   2. Title normalization (strip [SYNC], {Inperson}, #tags, URLs, parentheticals)
 *   3. Exact dedup by (normalized_title, started_at) — recurring meetings stay separate
 *   4. Same-time fuzzy merge via keyword overlap
 */

type Row = Record<string, unknown>;
type Insight = Row;
type Task = Row;
type Meeting = Row;

/* ------------------------------------------------------------------ */
/*  Phase 1: Noise patterns                                            */
/* ------------------------------------------------------------------ */

const NOISE_PATTERNS: RegExp[] = [
  // ── Meeting links, scheduling, & dial-in details ──
  /meet\.google\.com/i,
  /google meet link/i,
  /\bgoogle meet\b.*\bscheduled\b/i,
  /\bgoogle meet with\b/i,
  /dial-in/i,
  /zoom\.us/i,
  /^a meeting was held with\b/i,
  /^a \d+-(minute|hour)\b.*\b(meeting|event|sync|session) was\b/i,
  /\bmeeting.*is scheduled for\b/i,
  /^meeting schedul/i,
  /^a roadmap council meeting\b/i,
  /^a product synchronization session was held\b/i,
  /^concluded meetings with\b/i,
  /^sessions with\b.*\bhave been completed\b/i,
  /^stakeholder syncs were successfully completed\b/i,

  // ── Email sent / dispatched / drafted (transactional logs) ──
  /\bmissive\b.*\bdispatched\b/i,
  /\bdraft\b.*\b(email|parchment)\b.*\b(saved|prepared)\b/i,
  /\bregistration link was sent\b/i,
  /\bemail\b.*\bwas sent to\b/i,
  /\bsuccessfully dispatched via email\b/i,
  /\bhas been drafted\b/i,

  // ── Email addresses & contact info as primary content ──
  /^[^.]{0,50}email\s+(address\s+)?is\b/i,
  /\buses the email address\b/i,
  /\bcontact number is\b/i,
  /\bemail address is\b.*@/i,
  /\bcalendly link\b/i,

  // ── Travel logistics (broad) ──
  /^flight\s/i,
  /\bstaying at\b/i,
  /\btraveling to\b/i,
  /\bwill be in\b/i,
  /\bis traveling to\b/i,
  /\bis visiting\b.*\bfrom\b.*\bto\b/i,
  /\bstayed at\b.*\bfrom\b/i,
  /\bused makemytrip\b/i,
  /\bpnr\b.*\bflight\b/i,
  /\bflight\b.*\bpnr\b/i,
  /\bis attending\b.*\bevent\b/i,

  // ── Password resets ──
  /password reset/i,

  // ── AI assistant errors, failures, limitations ──
  /^the ai assistant is unable to/i,
  /^the ai assistant encountered\b/i,
  /^the ai assistant cannot\b/i,
  /^the ai assistant reported\b/i,
  /^the ai assistant lacks\b/i,
  /^the ai encountered\b/i,
  /^the ai assistant has a functional limit\b/i,
  /^the ai assistant.?s email\b.*\bunavailable\b/i,
  /^a task run was paused\b/i,
  /^the task to\b.*\bfailed due to\b/i,
  /^an issue was encountered\b/i,
  /^exact model ids are required\b/i,
  /^gemini api error\b/i,

  // ── AI assistant capability / persona descriptions ──
  /^the ai assistant is configured as\b/i,
  /^the ai assistant is positioned as\b/i,
  /^the ai assistant maintains\b/i,
  /^the ai assistant provides\b/i,
  /^the ai assistant can\b/i,
  /^the ai assistant enforces\b/i,
  /^the ai assistant prioritizes\b/i,
  /^the ai assistant uses a\b.*\bpersona\b/i,
  /^the ai assistant.?s\b.*\bcapabilit/i,
  /^the ai assistant.?s\b.*\bautomated\b/i,
  /^the ai assistant.?s\b.*\bemail\b/i,
  /^the ai assistant claims\b/i,
  /^the ai persona\b/i,
  /^the ai is adopting\b/i,
  /^the ai has completed\b/i,
  /^ai assistant\b.*\b(unable|role|lacks)/i,
  /^confirmation that the app\b/i,

  // ── Search / lookup result logs ──
  /^a search\b.*\byielded\b/i,
  /^a search of\b.*\brequired\b/i,
  /^a specific role for\b.*\bwas not found\b/i,
  /\bcontact details have been\b.*\bidentified\b/i,
  /\bemail has been identified\b/i,

  // ── Calendar / schedule status snapshots ──
  /\bcalendar\b.*\bis currently empty\b/i,
  /\bno tasks or calendar events\b/i,
  /\bno active high-priority items\b/i,
  /\bis free at\b.*\b(am|pm)\b/i,
  /\bis available for a meeting immediately\b/i,

  // ── Routine conversation / session logs ──
  /^routine conversation$/i,
  /^initial greetings\b/i,
  /^user interacted with ai assistant\b/i,
  /^drafting summary emails\b.*\brequires providing\b/i,

  // ── Document / drive links as titles ──
  /^link for\s+[''']/i,
  /\bto-do list\b.*\bis located at\b.*https/i,

  // ── API keys / secrets / org IDs ──
  /\bapi key\b.*\bsk-/i,
  /\bstaging\b.*\bapi key\b/i,
  /\borganisation id\b.*\borg-/i,
  /\bpayments profile id\b/i,

  // ── Trivial association / registration facts ──
  /\bis officially registered\b/i,
  /\bis associated with\b.*\(.*\.ai\)/i,
  /\bis on the waitlist for\b/i,
  /\bis enrolled in\b.*\bloyalty program\b/i,

  // ── Self-referential AI agent observations (vague/ephemeral) ──
  /^the user is (prioritizing|traveling|staying|receiving|currently engaging)/i,
  /^the executive is (coordinating|traveling|staying)/i,
  /^the user (maintains|prefers to be addressed|recently forgot|requested the ai|considers|received free|utilizes)/i,
  /^the user prefers\b.*\b(drafted|style)\b/i,
  /^the user has no\b/i,
  /^manas is free at\b/i,

  // ── Ephemeral status updates ──
  /^(google tagging|q\d+ report|the q\d+) .*(is complete|is missing|is currently missing)/i,
  /^there are no existing documents/i,
  /^currently scouting for\b/i,
  /^as of\b.*\bthere are no active alerts\b/i,
  /\bsix users\b.*\bmissing 2-step verification\b/i,
  /^the google account connection is currently broken\b/i,
  /^ui updates are a primary focus\b/i,
  /^the current chat runtime is powered by\b/i,
  /^the platform is currently in active development\b/i,

  // ── Trivial project identity statements ──
  /^the current project being built is called\b/i,

  // ── Vague implementation feedback ──
  /\bworked pretty well\b.*\binitial testing\b/i,

  // ── Folder sharing notifications ──
  /^the folder\b.*\bon google drive\b/i,

  // ── Subscription / payment receipts ──
  /\bsubscription\b.*\b(period|cost|paid on|ended)\b/i,
  /\binvoice\b.*\bpaid\b/i,

  // ── Meeting scheduling meta (not insights) ──
  /^meeting buffer:/i,
  /^working hours:/i,
  /^email sign(ature|-off)/i,
  /^headers should always use\b/i,
  /^task title standard:/i,
];

function isNoise(title: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(title));
}

/* ------------------------------------------------------------------ */
/*  Phase 2: Title normalization                                      */
/* ------------------------------------------------------------------ */

/** Synonym pairs: [pattern, replacement] */
const SYNONYMS: [RegExp, string][] = [
  [/\btechnical lead\b/gi, "tech lead"],
  [/\btech lead\b/gi, "tech lead"],
  [/\bsales lead\b/gi, "sales lead"],
  [/\bmodel context protocol\b/gi, "mcp"],
  [/\bbusiness learning models?\b/gi, "blm"],
  [/\bsmall language models?\b/gi, "slm"],
  [/\bconcierge validation\b/gi, "phase-0"],
  [/\bvertical mvp\b/gi, "phase-1"],
  [/\bblm formation\b/gi, "phase-2"],
  [/\bhorizontal platform\b/gi, "phase-3"],
  [/\bdeepnative\b/gi, "native"],
  [/\bnative ai\b/gi, "native"],
  [/\bnative ∀i\b/gi, "native"],
  [/\bnative ai labs inc\.?\b/gi, "native labs"],
  [/\bgoogle for startups cloud program\b/gi, "gfs-cloud"],
];

/** Strip dates in various formats */
function stripDates(s: string): string {
  return s
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "")
    .replace(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(st|nd|rd|th)?(,?\s+\d{4})?\b/gi,
      "",
    )
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}\b/gi, "")
    .replace(/\bon\s+\d{4}-\d{2}-\d{2}\b/g, "");
}

/** Replace "The user" / "The executive" with the insight owner if available */
function resolvePronouns(title: string, owner: string | null): string {
  if (!owner) return title;
  const name = owner.trim();
  return title
    .replace(/^the user\b/i, name)
    .replace(/^the executive\b/i, name);
}

function normalizeTitle(title: string, owner: string | null): string {
  let s = title.toLowerCase().trim();
  s = resolvePronouns(s, owner);
  s = stripDates(s);
  for (const [pat, rep] of SYNONYMS) s = s.replace(pat, rep);
  // Collapse whitespace & strip trailing punctuation
  s = s.replace(/\s+/g, " ").trim().replace(/[.!?;:,]+$/, "");
  return s;
}

/* ------------------------------------------------------------------ */
/*  Phase 3: Hierarchical prefix clustering + keyword overlap          */
/* ------------------------------------------------------------------ */

class UnionFind {
  parent: Map<string, string> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = x;
    while (cur !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

/**
 * Extract a set of significant keywords from a normalized title.
 * Applies basic stemming (strip trailing s/ing/ed) for better overlap.
 */
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "has", "have", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "for", "and", "or", "but",
  "in", "on", "at", "to", "of", "with", "by", "from", "as", "into",
  "that", "which", "who", "whom", "this", "these", "those", "it", "its",
  "also", "now", "currently", "specifically", "including", "over", "not",
  "via", "using", "through", "about", "than", "between", "during",
  "where", "there", "been", "must", "need", "needs", "requires",
  "serves", "responsible", "includes", "consists",
  "new", "due", "per", "all", "each", "any", "both", "such",
  "being", "while", "after", "before", "then", "more", "most",
]);

/**
 * Multi-pass English stemmer.
 * Pass 1: strip inflectional suffix (-ing, -ed, -s).
 * Pass 2: strip trailing silent 'e' (so "refine"→"refin" matches "refining"→"refin").
 */
function stem(word: string): string {
  let w = word;
  // Pass 1: inflectional suffixes
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  // Pass 2: trailing silent 'e' (but not double-e like "free", "tree")
  if (w.length > 3 && w.endsWith("e") && !w.endsWith("ee")) w = w.slice(0, -1);
  return w;
}

function extractKeywords(normalized: string): Set<string> {
  return new Set(
    normalized
      .replace(/[''""(),.:;!?/\\[\]{}|@#$%^&*+=<>~`]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
      .map(stem),
  );
}

/**
 * Similarity between two keyword sets.
 * Returns true if Jaccard ≥ 0.50 OR if ≥ 70% of the smaller set
 * is contained in the larger (with at least 3 matching keywords).
 * The containment check catches cases where a short title ("Manas is
 * the tech lead") is a subset of a longer one with extra details.
 */
function shouldMerge(a: Set<string>, b: Set<string>): boolean {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = a.size + b.size - inter;
  const jac = union === 0 ? 0 : inter / union;
  if (jac >= 0.50) return true;

  // Containment: does the smaller set mostly fit inside the larger?
  const minSize = Math.min(a.size, b.size);
  if (inter >= 3 && minSize > 0 && inter / minSize >= 0.70) return true;

  return false;
}

function pickBest(cluster: Insight[]): Insight {
  return cluster.sort((a, b) => {
    const occA = (a.occurrence_count as number) || 1;
    const occB = (b.occurrence_count as number) || 1;
    if (occB !== occA) return occB - occA;
    const dateA = a.created_at ? new Date(a.created_at as string).getTime() : 0;
    const dateB = b.created_at ? new Date(b.created_at as string).getTime() : 0;
    if (dateB !== dateA) return dateB - dateA;
    const lenA = ((a.title as string) || "").length;
    const lenB = ((b.title as string) || "").length;
    return lenB - lenA;
  })[0];
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface DedupeResult {
  insights: Insight[];
  stats: {
    inputCount: number;
    noiseDropped: number;
    duplicatesDropped: number;
    outputCount: number;
  };
}

export function deduplicateInsights(insights: Insight[]): DedupeResult {
  const inputCount = insights.length;

  // Phase 1: filter noise
  const afterNoise = insights.filter((i) => {
    const title = (i.title as string) || "";
    return !isNoise(title);
  });
  const noiseDropped = inputCount - afterNoise.length;

  // Phase 2: normalize titles and build tight clusters (50-char prefix)
  const tightClusters = new Map<string, Insight[]>();
  const normalizedByKey = new Map<string, string>(); // tight key → full normalized title

  for (const insight of afterNoise) {
    const title = (insight.title as string) || "";
    const owner = (insight.owner as string) || null;
    const norm = normalizeTitle(title, owner);
    const key = norm.slice(0, 50);
    if (!tightClusters.has(key)) {
      tightClusters.set(key, []);
      normalizedByKey.set(key, norm);
    }
    tightClusters.get(key)!.push(insight);
  }

  // Phase 3a: multi-tier prefix merge (35, 25 chars)
  const uf = new UnionFind();
  const tightKeys = [...tightClusters.keys()];

  for (const prefixLen of [35, 25]) {
    const groups = new Map<string, string[]>();
    for (const key of tightKeys) {
      const prefix = key.slice(0, prefixLen);
      if (!groups.has(prefix)) groups.set(prefix, []);
      groups.get(prefix)!.push(key);
    }
    for (const [, group] of groups) {
      if (group.length > 1) {
        for (let i = 1; i < group.length; i++) {
          uf.union(group[0], group[i]);
        }
      }
    }
  }

  // Phase 3b: keyword overlap merge (with stemming).
  // If two cluster reps share ≥ 50% stemmed keywords (Jaccard), merge them.
  const rootToKeys = new Map<string, string[]>();
  for (const key of tightKeys) {
    const root = uf.find(key);
    if (!rootToKeys.has(root)) rootToKeys.set(root, []);
    rootToKeys.get(root)!.push(key);
  }

  const roots = [...rootToKeys.keys()];
  const rootKeywords = new Map<string, Set<string>>();
  for (const root of roots) {
    const norm = normalizedByKey.get(root) || root;
    rootKeywords.set(root, extractKeywords(norm));
  }

  for (let i = 0; i < roots.length; i++) {
    const ri = uf.find(roots[i]);
    const kwI = rootKeywords.get(roots[i])!;
    if (kwI.size < 3) continue; // too few keywords to compare reliably

    for (let j = i + 1; j < roots.length; j++) {
      const rj = uf.find(roots[j]);
      if (ri === rj) continue; // already merged

      const kwJ = rootKeywords.get(roots[j])!;
      if (kwJ.size < 3) continue;

      if (shouldMerge(kwI, kwJ)) {
        uf.union(ri, rj);
      }
    }
  }

  // Build final merged clusters
  const merged = new Map<string, Insight[]>();
  for (const [key, cluster] of tightClusters) {
    const root = uf.find(key);
    if (!merged.has(root)) merged.set(root, []);
    merged.get(root)!.push(...cluster);
  }

  const deduped: Insight[] = [];
  let duplicatesDropped = 0;
  for (const [, cluster] of merged) {
    deduped.push(pickBest(cluster));
    duplicatesDropped += cluster.length - 1;
  }

  return {
    insights: deduped,
    stats: {
      inputCount,
      noiseDropped,
      duplicatesDropped,
      outputCount: deduped.length,
    },
  };
}

/* ================================================================== */
/*  TASK DEDUPLICATION                                                 */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  Task Phase 1: Noise filters                                        */
/* ------------------------------------------------------------------ */

/**
 * Assignee-based noise: drop tasks created by marketing/third-party email senders.
 * Pattern: assignee contains `<...@domain>` where domain is NOT deepnative.ai.
 * e.g. "Claude Team <No-Reply@Email.Claude.Com>", "Canva <Welcome@Engage.Canva.Com>"
 */
function isMarketingAssignee(assignee: string): boolean {
  const match = assignee.match(/<[^@]+@([^>]+)>/i);
  if (!match) return false;
  const domain = match[1].toLowerCase();
  return !domain.endsWith("deepnative.ai");
}

/** AI-assistant operational/meta task titles (only filtered when assignee is "AI Assistant") */
const AI_OPERATIONAL_PATTERNS: RegExp[] = [
  /^resolve\b.*\b(error|issue)\b/i,
  /^resume\b.*\bpaused\b/i,
  /^retry\b.*\b(analyz|process|run|task)\b/i,
  /^search knowledge base\b/i,
  /^investigate\b.*\b(functionality|availab|error)\b/i,
  /^fetch\b.*\b(emails?|messages?)\b/i,
  /^send meeting\b/i,
  /^share meeting link$/i,
  /^reconnect\b.*\baccount\b/i,
  /^check\b.*\b(calendar|schedule|status)\b/i,
  /^update\b.*\b(calendar|contacts?|email signature)\b/i,
  /^find\b.*\b(email|contact)\b/i,
  /^provide\b.*\bemail\b/i,
  /^create\b.*\btask\b/i,
  /^look\s?up\b/i,
  /^set reminder\b/i,
];

/** Title-based noise: test/placeholder tasks, feedback prompts, app download nudges */
const TASK_NOISE_PATTERNS: RegExp[] = [
  // Test / placeholder
  /^test\s*task\b/i,
  /^buy milk$/i,
  /^do this later$/i,
  /^placeholder\b/i,
  /^todo$/i,
  /^untitled$/i,
  /^sample task\b/i,

  // Feedback / marketing prompts
  /^share your feedback\b/i,
  /^download the app\b/i,
  /^rate\b.*\bexperience\b/i,
  /^subscribe\b.*\bnewsletter\b/i,

  // Transient scheduling (meeting link/invite actions)
  /^send meeting invitation$/i,
  /^share meeting link$/i,
  /^send calendar invite$/i,
];

function isTaskNoise(task: Task): boolean {
  const title = ((task.title as string) || "").trim();
  const assignee = ((task.assignee as string) || "").trim();

  // 1. Marketing assignee
  if (assignee && isMarketingAssignee(assignee)) return true;

  // 2. AI Assistant doing operational meta-tasks
  if (/^ai\s*assistant$/i.test(assignee)) {
    if (AI_OPERATIONAL_PATTERNS.some((p) => p.test(title))) return true;
  }

  // 3. Title-based noise
  if (TASK_NOISE_PATTERNS.some((p) => p.test(title))) return true;

  return false;
}

/* ------------------------------------------------------------------ */
/*  Task Phase 3: Cluster + pick best                                  */
/* ------------------------------------------------------------------ */

/** Priority ranking for pickBestTask (lower number = higher priority) */
const PRIORITY_RANK: Record<string, number> = {
  urgent: 0, high: 1, medium: 2, low: 3, none: 4,
};

function pickBestTask(cluster: Task[]): Task {
  return cluster.sort((a, b) => {
    // Prefer higher priority
    const pA = PRIORITY_RANK[((a.priority as string) || "none").toLowerCase()] ?? 4;
    const pB = PRIORITY_RANK[((b.priority as string) || "none").toLowerCase()] ?? 4;
    if (pA !== pB) return pA - pB;

    // Prefer more recent
    const dateA = a.created_at ? new Date(a.created_at as string).getTime() : 0;
    const dateB = b.created_at ? new Date(b.created_at as string).getTime() : 0;
    if (dateB !== dateA) return dateB - dateA;

    // Prefer longer title (more descriptive)
    const lenA = ((a.title as string) || "").length;
    const lenB = ((b.title as string) || "").length;
    return lenB - lenA;
  })[0];
}

/* ------------------------------------------------------------------ */
/*  Task Public API                                                    */
/* ------------------------------------------------------------------ */

export interface TaskDedupeResult {
  tasks: Task[];
  stats: {
    inputCount: number;
    noiseDropped: number;
    duplicatesDropped: number;
    outputCount: number;
  };
}

export function deduplicateTasks(tasks: Task[]): TaskDedupeResult {
  const inputCount = tasks.length;

  // Phase 1: filter noise
  const afterNoise = tasks.filter((t) => !isTaskNoise(t));
  const noiseDropped = inputCount - afterNoise.length;

  // Phase 2: normalize titles and build tight clusters (50-char prefix)
  const tightClusters = new Map<string, Task[]>();
  const normalizedByKey = new Map<string, string>();

  for (const task of afterNoise) {
    const title = (task.title as string) || "";
    const norm = normalizeTitle(title, null);
    const key = norm.slice(0, 50);
    if (!tightClusters.has(key)) {
      tightClusters.set(key, []);
      normalizedByKey.set(key, norm);
    }
    tightClusters.get(key)!.push(task);
  }

  // Phase 3a: multi-tier prefix merge (35, 25 chars)
  const uf = new UnionFind();
  const tightKeys = [...tightClusters.keys()];

  for (const prefixLen of [35, 25]) {
    const groups = new Map<string, string[]>();
    for (const key of tightKeys) {
      const prefix = key.slice(0, prefixLen);
      if (!groups.has(prefix)) groups.set(prefix, []);
      groups.get(prefix)!.push(key);
    }
    for (const [, group] of groups) {
      if (group.length > 1) {
        for (let i = 1; i < group.length; i++) {
          uf.union(group[0], group[i]);
        }
      }
    }
  }

  // Phase 3b: keyword overlap merge (with stemming)
  const rootToKeys = new Map<string, string[]>();
  for (const key of tightKeys) {
    const root = uf.find(key);
    if (!rootToKeys.has(root)) rootToKeys.set(root, []);
    rootToKeys.get(root)!.push(key);
  }

  const roots = [...rootToKeys.keys()];
  const rootKeywords = new Map<string, Set<string>>();
  for (const root of roots) {
    const norm = normalizedByKey.get(root) || root;
    rootKeywords.set(root, extractKeywords(norm));
  }

  for (let i = 0; i < roots.length; i++) {
    const ri = uf.find(roots[i]);
    const kwI = rootKeywords.get(roots[i])!;
    if (kwI.size < 3) continue;

    for (let j = i + 1; j < roots.length; j++) {
      const rj = uf.find(roots[j]);
      if (ri === rj) continue;

      const kwJ = rootKeywords.get(roots[j])!;
      if (kwJ.size < 3) continue;

      if (shouldMerge(kwI, kwJ)) {
        uf.union(ri, rj);
      }
    }
  }

  // Build final merged clusters
  const merged = new Map<string, Task[]>();
  for (const [key, cluster] of tightClusters) {
    const root = uf.find(key);
    if (!merged.has(root)) merged.set(root, []);
    merged.get(root)!.push(...cluster);
  }

  const deduped: Task[] = [];
  let duplicatesDropped = 0;
  for (const [, cluster] of merged) {
    deduped.push(pickBestTask(cluster));
    duplicatesDropped += cluster.length - 1;
  }

  return {
    tasks: deduped,
    stats: {
      inputCount,
      noiseDropped,
      duplicatesDropped,
      outputCount: deduped.length,
    },
  };
}

/* ================================================================== */
/*  MEETING DEDUPLICATION                                              */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  Meeting Phase 1: Noise filters                                     */
/* ------------------------------------------------------------------ */

const MEETING_NOISE_PATTERNS: RegExp[] = [
  // Test / placeholder meetings
  /^test\b/i,
  /\btest no approval\b/i,
  /^multi-day event$/i,
  /^placeholder\b/i,
  /^untitled$/i,
  /^sample meeting\b/i,

  // Travel / logistics (not actual meetings)
  /^flight\b/i,
];

function isMeetingNoise(meeting: Meeting): boolean {
  const title = ((meeting.title as string) || "").trim();

  // 1. Title-based noise
  if (MEETING_NOISE_PATTERNS.some((p) => p.test(title))) return true;

  // 2. Zero-participant deadline/reminder entries
  const participants = meeting.participants;
  const pCount = Array.isArray(participants) ? participants.length : 0;
  if (pCount === 0 && /(deadline|reminder|application)\b/i.test(title)) return true;

  return false;
}

/* ------------------------------------------------------------------ */
/*  Meeting Phase 2: Title normalization                               */
/* ------------------------------------------------------------------ */

function normalizeMeetingTitle(title: string): string {
  let s = title.trim();

  // Strip leading [SYNC] prefix
  s = s.replace(/^\[sync\]\s*/i, "");

  // Strip leading {Inperson} or similar braced prefixes
  s = s.replace(/^\{[^}]+\}\s*/i, "");

  // Strip leading "Recurring " prefix
  s = s.replace(/^recurring\s+/i, "");

  // Strip leading "Meeting: " (but keep "Meeting with ...")
  s = s.replace(/^meeting:\s*/i, "");

  // Strip trailing #hashtags (e.g., #eng, #admin, #product)
  s = s.replace(/\s+#\w+/g, "");

  // Strip "(Link: ...)" with URL content
  s = s.replace(/\s*\(link:\s*https?:\/\/[^)]+\)/i, "");

  // Strip trailing parenthetical notes (e.g., "(Gathering of the master builders)")
  s = s.replace(/\s*\([^)]+\)\s*$/, "");

  // Lowercase and collapse whitespace
  s = s.toLowerCase().replace(/\s+/g, " ").trim();

  return s;
}

/* ------------------------------------------------------------------ */
/*  Meeting Phase 3+4: Dedup by (title, time) + fuzzy same-time merge  */
/* ------------------------------------------------------------------ */

function pickBestMeeting(cluster: Meeting[]): Meeting {
  return cluster.sort((a, b) => {
    // Prefer more participants (richer data)
    const pA = Array.isArray(a.participants) ? a.participants.length : 0;
    const pB = Array.isArray(b.participants) ? b.participants.length : 0;
    if (pB !== pA) return pB - pA;

    // Prefer more recent created_at
    const dateA = a.created_at ? new Date(a.created_at as string).getTime() : 0;
    const dateB = b.created_at ? new Date(b.created_at as string).getTime() : 0;
    if (dateB !== dateA) return dateB - dateA;

    // Prefer longer title (more descriptive)
    const lenA = ((a.title as string) || "").length;
    const lenB = ((b.title as string) || "").length;
    return lenB - lenA;
  })[0];
}

/* ------------------------------------------------------------------ */
/*  Meeting Public API                                                 */
/* ------------------------------------------------------------------ */

export interface MeetingDedupeResult {
  meetings: Meeting[];
  stats: {
    inputCount: number;
    noiseDropped: number;
    duplicatesDropped: number;
    outputCount: number;
  };
}

export function deduplicateMeetings(meetings: Meeting[]): MeetingDedupeResult {
  const inputCount = meetings.length;

  // Phase 1: filter noise
  const afterNoise = meetings.filter((m) => !isMeetingNoise(m));
  const noiseDropped = inputCount - afterNoise.length;

  // Phase 2+3: normalize titles and group by (normalized_title, started_at)
  // Two meetings with same title but different start times are different events (recurring)
  const clusters = new Map<string, Meeting[]>();

  for (const meeting of afterNoise) {
    const title = (meeting.title as string) || "";
    const norm = normalizeMeetingTitle(title);
    const startedAt = meeting.started_at ? String(meeting.started_at) : "null";
    const key = `${norm}|||${startedAt}`;

    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key)!.push(meeting);
  }

  // Phase 4: within same started_at, merge near-duplicate titles via keyword overlap
  // e.g. "deepali sync" ≈ "sync with deepali" at same time → same meeting
  const byTime = new Map<string, string[]>();
  for (const key of clusters.keys()) {
    const startedAt = key.split("|||")[1];
    if (!byTime.has(startedAt)) byTime.set(startedAt, []);
    byTime.get(startedAt)!.push(key);
  }

  const uf = new UnionFind();
  for (const [, keys] of byTime) {
    if (keys.length < 2) continue;

    const keyKw = keys.map((k) => ({
      key: k,
      kw: extractKeywords(k.split("|||")[0]),
    }));

    for (let i = 0; i < keyKw.length; i++) {
      if (keyKw[i].kw.size < 2) continue;
      for (let j = i + 1; j < keyKw.length; j++) {
        if (keyKw[j].kw.size < 2) continue;
        if (uf.find(keyKw[i].key) === uf.find(keyKw[j].key)) continue;
        if (shouldMerge(keyKw[i].kw, keyKw[j].kw)) {
          uf.union(keyKw[i].key, keyKw[j].key);
        }
      }
    }
  }

  // Build final merged clusters
  const merged = new Map<string, Meeting[]>();
  for (const [key, cluster] of clusters) {
    const root = uf.find(key);
    if (!merged.has(root)) merged.set(root, []);
    merged.get(root)!.push(...cluster);
  }

  const deduped: Meeting[] = [];
  let duplicatesDropped = 0;
  for (const [, cluster] of merged) {
    deduped.push(pickBestMeeting(cluster));
    duplicatesDropped += cluster.length - 1;
  }

  return {
    meetings: deduped,
    stats: {
      inputCount,
      noiseDropped,
      duplicatesDropped,
      outputCount: deduped.length,
    },
  };
}
