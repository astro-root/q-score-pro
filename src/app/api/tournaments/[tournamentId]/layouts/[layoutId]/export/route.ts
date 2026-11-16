import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { buildLayoutExport } from "@/lib/display/layout-io";

type RouteParams = { params: Promise<{ tournamentId: string; layoutId: string }> };

// GET /api/tournaments/[tournamentId]/layouts/[layoutId]/export
// 表示レイアウトを JSON ファイルとして書き出す (D-05)。別の大会へ取り込んで再利用できる。
export async function GET(_request: Request, { params }: RouteParams) {
  const { tournamentId, layoutId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("display_layouts")
    .select("name, data")
    .eq("id", layoutId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const file = buildLayoutExport(data.name, data.data);
  // ファイル名に日本語を使えるよう RFC 5987 形式(filename*)も付ける。filename は ASCII の代替
  const encoded = encodeURIComponent(`${data.name}.json`);
  return new NextResponse(JSON.stringify(file, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="layout.json"; filename*=UTF-8''${encoded}`,
      "Cache-Control": "no-store",
    },
  });
}
