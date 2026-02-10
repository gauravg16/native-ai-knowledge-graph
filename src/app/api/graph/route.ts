import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { transformToGraph, TransformInput } from "@/lib/graph-transform";
import { NodeType } from "@/lib/types";
import { DEFAULT_MESSAGE_LIMIT, ALL_NODE_TYPES } from "@/lib/constants";

export const dynamic = "force-dynamic";

// Wrap supabase query builder into a proper Promise
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function q(builder: PromiseLike<any>): Promise<any> {
  return Promise.resolve(builder);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get("org_id");

    if (!orgId) {
      return NextResponse.json({ error: "org_id required" }, { status: 400 });
    }

    const typesParam = searchParams.get("types");
    const enabledTypes: Set<NodeType> = typesParam
      ? new Set(typesParam.split(",") as NodeType[])
      : new Set(ALL_NODE_TYPES);

    const messageLimit =
      parseInt(searchParams.get("limit_messages") || "") || DEFAULT_MESSAGE_LIMIT;

    /* --- Parallel fetch of all tables scoped to org --- */

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetches: Record<string, Promise<any>> = {};

    // Always fetch the org itself
    fetches.org = q(
      supabaseAdmin
        .from("organizations")
        .select("id, name, slug, created_at, business_brain_md")
        .eq("id", orgId)
        .single(),
    );

    if (enabledTypes.has("user")) {
      fetches.profiles = q(
        supabaseAdmin
          .from("profiles")
          .select("id, organization_id, full_name, role, response_persona, created_at")
          .eq("organization_id", orgId),
      );
    }

    if (enabledTypes.has("channel") || enabledTypes.has("message")) {
      fetches.channels = q(
        supabaseAdmin
          .from("channels")
          .select("id, organization_id, name, type, description, member_count, created_at")
          .eq("organization_id", orgId),
      );
    }

    if (enabledTypes.has("contact")) {
      fetches.contacts = q(
        supabaseAdmin
          .from("contacts")
          .select(
            "id, organization_id, name, email, role, department, relationship_type, reports_to, company_name, location, is_primary_contact, tags, created_at",
          )
          .eq("organization_id", orgId),
      );
    }

    if (enabledTypes.has("meeting")) {
      fetches.meetings = q(
        supabaseAdmin
          .from("meetings")
          .select("id, organization_id, title, platform, started_at, ended_at, participants, created_at")
          .eq("organization_id", orgId),
      );
    }

    if (enabledTypes.has("insight")) {
      fetches.insights = q(
        supabaseAdmin
          .from("insights")
          .select(
            "id, organization_id, type, title, summary, confidence, impact, owner, meeting_id, occurrence_count, created_at",
          )
          .eq("organization_id", orgId),
      );
    }

    if (enabledTypes.has("task")) {
      fetches.tasks = q(
        supabaseAdmin
          .from("tasks")
          .select("id, organization_id, title, assignee, state, priority, source_insight_id, due_at, created_at")
          .eq("organization_id", orgId),
      );
    }

    if (enabledTypes.has("context")) {
      fetches.contexts = q(
        supabaseAdmin
          .from("contexts")
          .select("id, organization_id, title, content, tags, meeting_id, source_id, created_at")
          .eq("organization_id", orgId),
      );
    }

    // Execute all in parallel
    const keys = Object.keys(fetches);
    const results = await Promise.all(Object.values(fetches));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataMap: Record<string, any> = {};
    keys.forEach((key, i) => {
      dataMap[key] = results[i].data;
    });

    // --- Messages (need channel IDs first) ---
    let messages: Record<string, unknown>[] = [];
    if (enabledTypes.has("message") && dataMap.channels) {
      const channelIds = (dataMap.channels as { id: string }[]).map((c) => c.id);
      if (channelIds.length > 0) {
        const { data: msgs } = await supabaseAdmin
          .from("messages")
          .select(
            "id, channel_id, author_id, content, is_ai_response, status, created_at, reply_to_id, mention_count",
          )
          .in("channel_id", channelIds)
          .order("created_at", { ascending: false })
          .limit(messageLimit);
        messages = (msgs || []) as Record<string, unknown>[];
      }
    }

    // --- Join tables (only for messages we have) ---
    let mentions: Record<string, unknown>[] = [];
    let reads: Record<string, unknown>[] = [];
    if (messages.length > 0) {
      const msgIds = messages.map((m) => m.id as string);
      const [mentionRes, readRes] = await Promise.all([
        q(
          supabaseAdmin
            .from("message_mentions")
            .select("id, message_id, mentioned_user_id, mentioned_by_user_id")
            .in("message_id", msgIds),
        ),
        q(
          supabaseAdmin
            .from("message_reads")
            .select("id, message_id, user_id")
            .in("message_id", msgIds),
        ),
      ]);
      mentions = (mentionRes.data || []) as Record<string, unknown>[];
      reads = (readRes.data || []) as Record<string, unknown>[];
    }

    // --- Transform ---
    const input: TransformInput = {
      org: dataMap.org || null,
      profiles: (dataMap.profiles || []) as Record<string, unknown>[],
      channels: (dataMap.channels || []) as Record<string, unknown>[],
      messages,
      contacts: (dataMap.contacts || []) as Record<string, unknown>[],
      meetings: (dataMap.meetings || []) as Record<string, unknown>[],
      insights: (dataMap.insights || []) as Record<string, unknown>[],
      tasks: (dataMap.tasks || []) as Record<string, unknown>[],
      contexts: (dataMap.contexts || []) as Record<string, unknown>[],
      mentions,
      reads,
      enabledTypes,
    };

    const graphResponse = transformToGraph(input);
    return NextResponse.json(graphResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
