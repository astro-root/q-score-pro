import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { buildEntrySearchFilter } from "@/lib/supabase/filters";
import { mapEntryInsertError } from "@/lib/entries/guard";
import { clientIpFrom, createRateLimiter } from "@/lib/rate-limit";

// 公開フォームの前段のレート制限 (R-05)。同じ会場・学校のWi-Fi(同一IP)から
// 多人数が同時に申し込む場面を考慮して、1IP・1大会あたり10分に30件までとする。
// DBトリガーによる大会単位の上限・重複防止が本当の防御線(0011参照)。
const entryRateLimiter = createRateLimiter({ limit: 30, windowMs: 10 * 60 * 1000 });

const answerValueSchema = z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]);

const submitSchema = z.object({
  displayName: z.string().min(1, "表示名を入力してください").max(200),
  email: z.string().trim().email("メールアドレスの形式が正しくありません"),
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
    // 検索語はユーザー入力。カンマ・括弧・引用符がPostgRESTのフィルタ構文として解釈されないようにする(R-10)
    query = query.or(buildEntrySearchFilter(q));
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

  const limit = entryRateLimiter.check(`${tournamentId}:${clientIpFrom(request.headers)}`);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "短時間に送信が集中しています。しばらく待ってからもう一度お試しください",
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

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

  // NOTE: intentionally no .select() here. Public/anonymous entrants have
  // no SELECT permission on `entries` (staff-only, see
  // entries_select_admin policy) - chaining .select() would make
  // PostgREST attempt to RETURNING the inserted row, which RLS then
  // blocks, turning a successful insert into a reported failure. Without
  // .select(), the client sends `Prefer: return=minimal` and RLS's
  // INSERT/WITH CHECK policy (entries_insert_public_when_open) is the
  // only check that applies.
  const { error } = await supabase.from("entries").insert({
    tournament_id: tournamentId,
    display_name: parsed.data.displayName,
    email: parsed.data.email,
    affiliation: parsed.data.affiliation ?? null,
    answers,
  });

  if (error) {
    // 重複(23505)・受付上限(QS429)・受付終了(RLS)を、入力者に分かる形で返す
    const mapped = mapEntryInsertError(error);
    return NextResponse.json(mapped.body, { status: mapped.status, headers: mapped.headers });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
