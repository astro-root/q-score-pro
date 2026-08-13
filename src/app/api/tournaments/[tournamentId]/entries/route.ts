import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

const answerValueSchema = z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]);

const submitSchema = z.object({
  displayName: z.string().min(1, "表示名を入力してください").max(200),
  email: z.string().email("メールアドレスの形式が正しくありません"),
  affiliation: z.string().max(200).optional(),
  answers: z.record(z.string(), answerValueSchema).optional(),
});

type RouteParams = { params: Promise<{ tournamentId: string }> };

// GET /api/tournaments/[tournamentId]/entries?q=&status=
// Staff-only list with simple search (name/email/affiliation) and status filter.
export async function GET(request: Request, { params }: RouteParams) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:manage_entries")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const status = url.searchParams.get("status");

  const supabase = await createClient();
  let query = supabase
    .from("entries")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("submitted_at", { ascending: false });

  if (status === "SUBMITTED" || status === "WITHDRAWN") {
    query = query.eq("status", status);
  }
  if (q) {
    query = query.or(
      `display_name.ilike.%${q}%,email.ilike.%${q}%,affiliation.ilike.%${q}%`
    );
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ entries: data });
}

// POST /api/tournaments/[tournamentId]/entries
// Public submission - no authentication required. RLS
// (entries_insert_public_when_open) is the real gate: it only allows the
// insert while the tournament's status is REGISTRATION_OPEN. We validate
// required custom fields here at the application layer since jsonb columns
// can't express "required" constraints declaratively in Postgres easily,
// and because a clean 400 is a much better UX than a raw DB error.
export async function POST(request: Request, { params }: RouteParams) {
  const { tournamentId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: fields, error: fieldsError } = await supabase
    .from("entry_form_fields")
    .select("field_key, label, is_required")
    .eq("tournament_id", tournamentId);
  if (fieldsError) return NextResponse.json({ error: fieldsError.message }, { status: 500 });

  const answers = parsed.data.answers ?? {};
  const missing = (fields ?? []).filter(
    (f) => f.is_required && (answers[f.field_key] === undefined || answers[f.field_key] === "")
  );
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: "missing_required_fields",
        message: `未入力の必須項目があります: ${missing.map((f) => f.label).join(", ")}`,
      },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("entries")
    .insert({
      tournament_id: tournamentId,
      display_name: parsed.data.displayName,
      email: parsed.data.email,
      affiliation: parsed.data.affiliation ?? null,
      answers,
    })
    .select()
    .single();

  if (error) {
    // RLS violation surfaces as a generic permissions error - translate it
    // into something the entrant can understand (entries are closed).
    const closed = error.message.toLowerCase().includes("row-level security");
    return NextResponse.json(
      {
        error: closed ? "entries_closed" : error.message,
        message: closed ? "現在この大会はエントリーを受け付けていません" : undefined,
      },
      { status: closed ? 409 : 500 }
    );
  }

  return NextResponse.json({ entry: data }, { status: 201 });
}
