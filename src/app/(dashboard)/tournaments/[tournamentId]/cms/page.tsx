import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { CmsForm } from "./cms-form";

export default async function CmsPage({
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
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament) notFound();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">大会ページ編集</h1>
      <p className="mb-6 text-sm text-slate-500">
        ここで編集した内容が公開ページ (/t/{tournament.slug}) に反映されます。
      </p>
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <CmsForm tournament={tournament} />
      </div>
    </div>
  );
}
