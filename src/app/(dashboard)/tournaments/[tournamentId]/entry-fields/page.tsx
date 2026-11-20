import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { TOURNAMENT_STATUS_LABEL } from "@/lib/tournament/status";
import { PageHeader } from "@/components/ui/PageHeader";
import { LinkButton } from "@/components/ui/Button";
import { EntryFieldsEditor } from "./entry-fields-editor";
import { EntrySettings } from "./entry-settings";

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
  const [{ data: fields }, { data: tournament }] = await Promise.all([
    supabase
      .from("entry_form_fields")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("tournaments")
      .select("slug, status, entry_opens_at, entry_closes_at, entry_auto_register")
      .eq("id", tournamentId)
      .maybeSingle(),
  ]);
  if (!tournament) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="エントリーフォーム"
        description="応募者に入力してもらう項目と、受付期間を設定します。"
        actions={
          <LinkButton href={`/t/${tournament.slug}/entry`} variant="secondary" size="sm">
            公開フォームを開く
          </LinkButton>
        }
      />
      <EntrySettings
        tournamentId={tournamentId}
        initialOpensAt={tournament.entry_opens_at}
        initialClosesAt={tournament.entry_closes_at}
        initialAutoRegister={tournament.entry_auto_register}
        statusLabel={TOURNAMENT_STATUS_LABEL[tournament.status] ?? tournament.status}
        isOpenStatus={tournament.status === "REGISTRATION_OPEN"}
      />
      <EntryFieldsEditor tournamentId={tournamentId} initialFields={fields ?? []} />
    </div>
  );
}
