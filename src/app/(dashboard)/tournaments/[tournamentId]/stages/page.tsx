import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { StagesManager } from "./stages-manager";

export default async function StagesPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);

  if (!role) notFound();
  if (!can(role, "tournament:manage_rounds")) {
    redirect(`/tournaments/${tournamentId}`);
  }

  const supabase = await createClient();
  const [{ data: stages }, { data: rounds }] = await Promise.all([
    supabase
      .from("stages")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("rounds")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("sort_order", { ascending: true }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">ステージ管理</h1>
      <StagesManager tournamentId={tournamentId} initialStages={stages ?? []} rounds={rounds ?? []} />
    </div>
  );
}
