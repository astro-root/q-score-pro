import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createTournamentSchema = z.object({
  name: z.string().min(1, "大会名を入力してください").max(200),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$/, "半角英小文字・数字・ハイフンのみ使用できます"),
  summary: z.string().max(2000).optional(),
});

// GET /api/tournaments - tournaments the caller is staff of, most recent first.
// (RLS already scopes this to "published" + "my tournaments"; we don't need
// extra filtering here, but we keep the query explicit for clarity.)
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("tournaments")
    .select("id, slug, name, status, summary, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tournaments: data });
}

// POST /api/tournaments - create a tournament and register the caller as OWNER.
// Two inserts, both still governed by RLS (see 0001_init.sql):
//   1. tournaments.insert requires owner_id = auth.uid()
//   2. tournament_members.insert (bootstrap policy) requires role='OWNER',
//      user_id = auth.uid(), and the tournament to already be owned by them.
// If step 2 fails we roll back step 1 manually, since Postgres RLS-checked
// multi-statement rollback isn't available to us over PostgREST.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createTournamentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .insert({
      name: parsed.data.name,
      slug: parsed.data.slug,
      summary: parsed.data.summary ?? null,
      owner_id: user.id,
    })
    .select()
    .single();

  if (tournamentError) {
    const status = tournamentError.code === "23505" ? 409 : 500; // unique_violation on slug
    return NextResponse.json({ error: tournamentError.message }, { status });
  }

  const { error: memberError } = await supabase.from("tournament_members").insert({
    tournament_id: tournament.id,
    user_id: user.id,
    role: "OWNER",
  });

  if (memberError) {
    // Best-effort rollback so we never leave an orphaned, staff-less tournament.
    await supabase.from("tournaments").delete().eq("id", tournament.id);
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json({ tournament }, { status: 201 });
}
