import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { LayoutsManager } from "./layouts-manager";

export default async function LayoutsPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);

  if (!role) notFound();
  if (!can(role, "tournament:manage_cms")) {
    redirect(`/tournaments/${tournamentId}`);
  }

  const supabase = await createClient();
  const [{ data: layouts }, { data: rounds }] = await Promise.all([
    supabase
      .from("display_layouts")
      .select("id, name, updated_at")
      .eq("tournament_id", tournamentId)
      .order("created_at", { ascending: true }),
    supabase
      .from("rounds")
      .select("id, name")
      .eq("tournament_id", tournamentId)
      .order("sort_order", { ascending: true }),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">得点表示画面レイアウト</h1>
      <p className="mb-6 text-sm text-slate-500">
        大会ごとに複数のレイアウト(Main / Scoreboard / Final / OBS など)を作成・保存できます。
      </p>
      <LayoutsManager tournamentId={tournamentId} initialLayouts={layouts ?? []} rounds={rounds ?? []} />
    </div>
  );
}
