import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

const fieldSchema = z.object({
  fieldKey: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/, "半角英小文字・数字・アンダースコアのみ使用できます"),
  label: z.string().min(1).max(200),
  fieldType: z.enum(["TEXT", "TEXTAREA", "EMAIL", "NUMBER", "SELECT", "CHECKBOX"]),
  isRequired: z.boolean().optional(),
  options: z.array(z.string().max(100)).max(50).optional(),
});

const replaceSchema = z.object({
  fields: z.array(fieldSchema).max(50),
});

type RouteParams = { params: Promise<{ tournamentId: string }> };

// GET is public: the entry form needs the field definitions to render, and
// entrants are not authenticated. See entry_form_fields_select_public policy.
export async function GET(_request: Request, { params }: RouteParams) {
  const { tournamentId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entry_form_fields")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ fields: data });
}

export async function PUT(request: Request, { params }: RouteParams) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:manage_cms")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = replaceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const keys = parsed.data.fields.map((f) => f.fieldKey);
  if (new Set(keys).size !== keys.length) {
    return NextResponse.json(
      { error: "duplicate_field_key", message: "項目キーが重複しています" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("entry_form_fields")
    .delete()
    .eq("tournament_id", tournamentId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  if (parsed.data.fields.length === 0) {
    return NextResponse.json({ fields: [] });
  }

  const { data, error: insertError } = await supabase
    .from("entry_form_fields")
    .insert(
      parsed.data.fields.map((f, index) => ({
        tournament_id: tournamentId,
        field_key: f.fieldKey,
        label: f.label,
        field_type: f.fieldType,
        is_required: f.isRequired ?? false,
        options: f.fieldType === "SELECT" ? (f.options ?? []) : null,
        sort_order: index,
      }))
    )
    .select();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json({ fields: data });
}
