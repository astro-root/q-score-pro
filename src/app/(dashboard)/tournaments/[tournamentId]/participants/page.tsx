import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { ParticipantsManager } from "./participants-manager";

export default async function ParticipantsPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);

  if (!role) notFound();
  if (!can(role, "tournament:manage_participants")) {
    redirect(`/tournaments/${tournamentId}`);
  }

  const supabase = await createClient();

  const [{ data: participants }, { data: entries }] = await Promise.all([
    supabase
      .from("participants")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("created_at", { ascending: true }),
    supabase
      .from("entries")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("status", "SUBMITTED")
      .order("submitted_at", { ascending: true }),
  ]);

  const importedEntryIds = new Set(
    (participants ?? []).map((p) => p.entry_id).filter((id): id is string => !!id)
  );
  const unimportedEntries = (entries ?? []).filter((e) => !importedEntryIds.has(e.id));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">参加者管理</h1>
      <ParticipantsManager
        tournamentId={tournamentId}
        initialParticipants={participants ?? []}
        unimportedEntries={unimportedEntries}
      />
    </div>
  );
}
