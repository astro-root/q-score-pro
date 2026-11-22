import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
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

  const isPublic = tournament.status !== "DRAFT";

  return (
    <div>
      <PageHeader
        title="大会ページ編集"
        description={`ここで編集した内容が公開ページ (/t/${tournament.slug}) に反映されます。`}
        actions={
          <>
            <Badge tone={isPublic ? "success" : "neutral"}>{isPublic ? "公開中" : "非公開(下書き)"}</Badge>
            <LinkButton href={`/t/${tournament.slug}`} variant="secondary" size="sm">
              公開ページを開く
            </LinkButton>
          </>
        }
      />
      {!isPublic && (
        <p className="mb-4 rounded-xl border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
          大会のステータスが「下書き」の間、公開ページはスタッフ以外には表示されません。大会トップのステータス変更で公開できます。
        </p>
      )}
      <div className="rounded-lg border border-border bg-surface p-6">
        <CmsForm tournament={tournament} />
      </div>
    </div>
  );
}
