import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { MAX_IMPORT_BYTES } from "@/lib/display/limits";
import { parseLayoutImport } from "@/lib/display/layout-io";

const importSchema = z.object({
  // 画面で入力した名前。省略したらファイルに書かれた名前を使う
  name: z.string().trim().min(1).max(100).optional(),
  // 書き出したファイルの中身。形の検証は parseLayoutImport が行う
  layout: z.unknown(),
});

type RouteParams = { params: Promise<{ tournamentId: string }> };

// POST /api/tournaments/[tournamentId]/layouts/import  { name?, layout }
// 書き出した表示レイアウトのJSONを、新しいレイアウトとして取り込む (D-05)。
// 外部から来た入力として検証・無害化する(layout-io.ts)。既存のレイアウトは上書きしない。
export async function POST(request: Request, { params }: RouteParams) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:manage_cms")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const text = await request.text();
  if (text.length > MAX_IMPORT_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: "ファイルが大きすぎます(1MBまで)" },
      { status: 413 }
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "JSONとして読み取れませんでした" },
      { status: 400 }
    );
  }

  const parsedBody = importSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "invalid_input", message: "リクエストの形が正しくありません" },
      { status: 400 }
    );
  }

  const result = parseLayoutImport(parsedBody.data.layout);
  if (!result.ok) {
    return NextResponse.json({ error: "invalid_layout", message: result.message }, { status: 400 });
  }

  const name = parsedBody.data.name ?? result.name ?? "取り込んだレイアウト";

  const supabase = await createClient();
  const user = await getCurrentUser();
  const { data: layout, error } = await supabase
    .from("display_layouts")
    .insert({
      tournament_id: tournamentId,
      name,
      data: result.data,
      created_by: user?.id ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ layout, warnings: result.warnings }, { status: 201 });
}
