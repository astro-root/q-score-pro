import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { LayoutEditor } from "./layout-editor";

export default async function LayoutEditorPage({
  params,
}: {
  params: Promise<{ tournamentId: string; layoutId: string }>;
}) {
  const { tournamentId, layoutId } = await params;
  const role = await getTournamentRole(tournamentId);

  if (!role) notFound();
  if (!can(role, "tournament:manage_cms")) {
    redirect(`/tournaments/${tournamentId}`);
  }

  const supabase = await createClient();

  const [{ data: layout }, { data: rounds }, { data: participants }] = await Promise.all([
    supabase
      .from("display_layouts")
      .select("*")
      .eq("id", layoutId)
      .eq("tournament_id", tournamentId)
      .maybeSingle(),
    supabase
      .from("rounds")
      .select("id, name")
      .eq("tournament_id", tournamentId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("participants")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("display_name", { ascending: true }),
  ]);

  if (!layout) notFound();

  return (
    <LayoutEditor
      tournamentId={tournamentId}
      layoutId={layoutId}
      initialName={layout.name}
      initialData={layout.data}
      rounds={rounds ?? []}
      participants={participants ?? []}
    />
  );
}
