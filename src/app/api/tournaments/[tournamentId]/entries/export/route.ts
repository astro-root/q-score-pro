import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

type RouteParams = { params: Promise<{ tournamentId: string }> };

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:manage_entries")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();

  const [{ data: fields, error: fieldsError }, { data: entries, error: entriesError }] =
    await Promise.all([
      supabase
        .from("entry_form_fields")
        .select("field_key, label")
        .eq("tournament_id", tournamentId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("entries")
        .select("*")
        .eq("tournament_id", tournamentId)
        .order("submitted_at", { ascending: true }),
    ]);

  if (fieldsError) return NextResponse.json({ error: fieldsError.message }, { status: 500 });
  if (entriesError) return NextResponse.json({ error: entriesError.message }, { status: 500 });

  const baseHeaders = ["表示名", "メールアドレス", "所属", "ステータス", "エントリー日時"];
  const customHeaders = (fields ?? []).map((f) => f.label);
  const headerRow = [...baseHeaders, ...customHeaders].map(csvEscape).join(",");

  const rows = (entries ?? []).map((e) => {
    const base = [e.display_name, e.email, e.affiliation ?? "", e.status, e.submitted_at];
    const answers = e.answers as Record<string, unknown>;
    const custom = (fields ?? []).map((f) => answers?.[f.field_key] ?? "");
    return [...base, ...custom].map(csvEscape).join(",");
  });

  // Prepend a UTF-8 BOM so Excel (including Japanese Excel) opens the file
  // with correct encoding instead of mojibake.
  const csv = "\uFEFF" + [headerRow, ...rows].join("\r\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="entries-${tournamentId}.csv"`,
    },
  });
}
