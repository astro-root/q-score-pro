import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { ScheduleEditor } from "./schedule-editor";

export default async function SchedulePage({
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
  const { data: items } = await supabase
    .from("schedule_items")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("sort_order", { ascending: true });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">スケジュール管理</h1>
      <ScheduleEditor tournamentId={tournamentId} initialItems={items ?? []} />
    </div>
  );
}
