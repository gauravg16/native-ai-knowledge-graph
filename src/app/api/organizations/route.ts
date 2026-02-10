import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { OrgSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

// Wrap supabase query builder into a proper Promise
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function q(builder: PromiseLike<any>): Promise<any> {
  return Promise.resolve(builder);
}

export async function GET() {
  try {
    const { data: orgs, error } = await supabaseAdmin
      .from("organizations")
      .select("id, name, slug")
      .order("name");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Count nodes per org in parallel
    const summaries: OrgSummary[] = await Promise.all(
      (orgs || []).map(async (org) => {
        const tables = [
          "profiles",
          "channels",
          "contacts",
          "meetings",
          "insights",
          "tasks",
          "contexts",
        ];

        const results = await Promise.all(
          tables.map((t) =>
            q(
              supabaseAdmin
                .from(t)
                .select("id", { count: "exact", head: true })
                .eq("organization_id", org.id),
            ),
          ),
        );

        const counts: Record<string, number> = {};
        tables.forEach((t, i) => {
          counts[t] = results[i].count ?? 0;
        });

        // Messages: need channel IDs first (no direct org_id on messages)
        const { data: channels } = await supabaseAdmin
          .from("channels")
          .select("id")
          .eq("organization_id", org.id);

        const channelIds = (channels || []).map((c) => c.id);
        let msgCount = 0;
        if (channelIds.length > 0) {
          const { count } = await supabaseAdmin
            .from("messages")
            .select("id", { count: "exact", head: true })
            .in("channel_id", channelIds);
          msgCount = count ?? 0;
        }
        counts.messages = msgCount;

        const total = Object.values(counts).reduce((a, b) => a + b, 0);

        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          counts,
          total,
        };
      }),
    );

    // Only return orgs with data, sorted by total descending
    const active = summaries
      .filter((s) => s.total > 0)
      .sort((a, b) => b.total - a.total);

    return NextResponse.json(active);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
