import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { EntryFieldsEditor } from "./entry-fields-editor";

export default async function EntryFieldsPage({
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
  const { data: fields } = await supabase
    .from("entry_form_fields")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("sort_order", { ascending: true });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">エントリーフォーム項目設定</h1>
      <EntryFieldsEditor tournamentId={tournamentId} initialFields={fields ?? []} />
    </div>
  );
}
