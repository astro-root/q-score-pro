import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

const cmsSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  summary: z.string().max(2000).nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  mainVisualUrl: z.string().url().nullable().optional(),
  venue: z.string().max(200).nullable().optional(),
  organizerName: z.string().max(200).nullable().optional(),
  contactInfo: z.string().max(1000).nullable().optional(),
  rulesContent: z.string().max(20000).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  eventStartsAt: z.string().datetime().nullable().optional(),
  eventEndsAt: z.string().datetime().nullable().optional(),
  entryStartsAt: z.string().datetime().nullable().optional(),
  entryEndsAt: z.string().datetime().nullable().optional(),
  capacity: z.number().int().positive().nullable().optional(),
});

type RouteParams = { params: Promise<{ tournamentId: string }> };

// GET is intentionally omitted here: the tournament dashboard already fetches
// the full tournament row (RLS-scoped) directly via Supabase. This route
// only needs to exist for the write path.
export async function PATCH(request: Request, { params }: RouteParams) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);

  if (!can(role, "tournament:manage_cms")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = cmsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournaments")
    .update({
      ...(d.name !== undefined && { name: d.name }),
      ...(d.summary !== undefined && { summary: d.summary }),
      ...(d.logoUrl !== undefined && { logo_url: d.logoUrl }),
      ...(d.mainVisualUrl !== undefined && { main_visual_url: d.mainVisualUrl }),
      ...(d.venue !== undefined && { venue: d.venue }),
      ...(d.organizerName !== undefined && { organizer_name: d.organizerName }),
      ...(d.contactInfo !== undefined && { contact_info: d.contactInfo }),
      ...(d.rulesContent !== undefined && { rules_content: d.rulesContent }),
      ...(d.notes !== undefined && { notes: d.notes }),
      ...(d.eventStartsAt !== undefined && { event_starts_at: d.eventStartsAt }),
      ...(d.eventEndsAt !== undefined && { event_ends_at: d.eventEndsAt }),
      ...(d.entryStartsAt !== undefined && { entry_starts_at: d.entryStartsAt }),
      ...(d.entryEndsAt !== undefined && { entry_ends_at: d.entryEndsAt }),
      ...(d.capacity !== undefined && { capacity: d.capacity }),
    })
    .eq("id", tournamentId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ tournament: data });
}
