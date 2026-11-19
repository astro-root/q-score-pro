import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { buildCsv } from "@/lib/csv";
import { participantsCsvRows } from "@/lib/paper/csv-rows";

type RouteParams = { params: Promise<{ tournamentId: string }> };

const STATUSES = ["ACTIVE", "DISQUALIFIED", "ABSENT", "WITHDRAWN"] as const;

// GET /api/tournaments/[tournamentId]/participants/export?status=ACTIVE
// 参加者一覧のCSV。status を付けるとその状態だけに絞る。
export async function GET(request: Request, { params }: RouteParams) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:export_data")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const status = new URL(request.url).searchParams.get("status");
  if (status && !(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "invalid_status", allowed: STATUSES }, { status: 400 });
  }

  const supabase = await createClient();
  const PAGE = 1000;
  const all: {
    display_name: string;
    affiliation: string | null;
    status: string;
    seed: number | null;
    created_at: string;
  }[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = supabase
      .from("participants")
      .select("display_name, affiliation, status, seed, created_at")
      .eq("tournament_id", tournamentId);
    const filtered = status ? base.eq("status", status as (typeof STATUSES)[number]) : base;
    const q = filtered
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    all.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }

  const csv = buildCsv(
    participantsCsvRows(
      all.map((p) => ({
        displayName: p.display_name,
        affiliation: p.affiliation,
        status: p.status,
        seed: p.seed,
        createdAt: p.created_at,
      }))
    )
  );

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="participants-${tournamentId}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
