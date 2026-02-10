# Native AI — Knowledge Graph Visualizer

**Live:** https://native-ai-knowledge-graph.vercel.app

Interactive knowledge graph built from a live Supabase database (Native AI messaging platform). Queries real data in real-time — no static exports, no mocked data.

---

## What It Does

Takes a **relational Supabase database** (31 tables, ~4,000 rows) and renders it as an **interactive force-directed graph** in the browser. Select an organization, toggle entity types on/off, click any node to inspect its properties.

**Graph model:** 9 node types, 16 relationship types, ~766 nodes and ~785 edges per organization.

## Architecture

```
Browser (Next.js)          Vercel (Server)              Supabase
┌──────────────┐      ┌─────────────────────┐     ┌──────────────┐
│ react-force- │ ───► │ /api/graph          │ ──► │ PostgreSQL   │
│ graph-2d     │      │   fetch 9 tables    │     │ REST API     │
│              │      │   transform → graph │     │ (service_role│
│ Dashboard    │      │   return JSON       │     │  key, RLS    │
│ Filters      │      │                     │     │  bypassed)   │
│ Detail Panel │      │ /api/organizations  │     │              │
└──────────────┘      └─────────────────────┘     └──────────────┘
```

**Key design decision:** The service_role key never reaches the client. API routes run server-side on Vercel, acting as a secure proxy to Supabase.

## Why a Graph?

Relational databases store data in flat tables connected by foreign keys. This works for CRUD operations but obscures the **topology** of the data — how entities relate to each other across tables.

The insight behind this project: **foreign keys ARE edges**. Every `organization_id`, `channel_id`, `author_id`, `meeting_id`, `source_insight_id` column is an implicit relationship. By extracting these into an explicit graph, patterns become visible that SQL queries alone can't surface:

- **Intelligence chains:** Meeting → Insight → Task (how meetings generate action items)
- **Communication topology:** Which users post in which channels, who mentions whom
- **Knowledge provenance:** Context → Meeting → Organization (where knowledge originates)

## Graph Model

| Node Type (9) | Source Table | Key Properties |
|---|---|---|
| Organization | `organizations` | name, slug, has_brain |
| User | `profiles` | full_name, role |
| Channel | `channels` | name, type, member_count |
| Message | `messages` | content_preview, is_ai_response |
| Contact | `contacts` | name, email, company, relationship_type |
| Meeting | `meetings` | title, platform, participants |
| Insight | `insights` | type, title, confidence, impact |
| Task | `tasks` | title, assignee, state, priority |
| Context | `contexts` | title, tags, source_id |

**16 edge types** derived from foreign keys (`MEMBER_OF`, `HAS_CHANNEL`, `POSTED_IN`, `AUTHORED_BY`, `REPLIES_TO`, `IN_ORG`, `REPORTS_TO`, `FROM_MEETING`, `FROM_INSIGHT`) and join tables (`MENTIONS`, `READ_BY`).

## What I Engineered

1. **Schema-to-graph transform** — Automated conversion of relational FKs into graph edges with referential integrity validation. Written first in Python, then ported to TypeScript for the web app.

2. **Parallel data fetching** — 9 Supabase tables queried concurrently. Messages require two-phase fetch (channels first, then messages by channel_id) since they lack a direct `organization_id` FK.

3. **Performance-conscious visualization** — Messages (~800/org) OFF by default to keep graph under ~800 nodes. Custom Canvas rendering with node sizing by entity importance and 50-tick warmup for stable initial layout.

4. **Security model** — `service_role` key stays server-side in Vercel env vars. No `NEXT_PUBLIC_` prefix. Browser never sees credentials.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, TypeScript, Tailwind CSS |
| Visualization | react-force-graph-2d (HTML5 Canvas) |
| Backend | Next.js API Routes (server-side) |
| Database | Supabase PostgreSQL (REST API) |
| Deployment | Vercel |

## Running Locally

```bash
cd kg-web
cp .env.example .env.local   # add Supabase credentials
npm install
npm run dev                   # http://localhost:3000
```
