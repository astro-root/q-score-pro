import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { visibleNav } from "@/lib/tournament/nav";
import { TOURNAMENT_STATUS_LABEL } from "@/lib/tournament/status";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusControl } from "./status-control";

export default async function TournamentDashboardPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, slug, status, summary, created_at")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament) notFound();

  const role = await getTournamentRole(tournamentId);
  const shortcuts = visibleNav(role)
    .flatMap((g) => g.items)
    .filter((i) => i.path !== "");

  return (
    <div>
      <PageHeader
        eyebrow="大会概要"
        title={tournament.name}
        description={
          <span className="inline-flex items-center gap-2">
            /{tournament.slug}
            <Badge tone="primary">{TOURNAMENT_STATUS_LABEL[tournament.status] ?? tournament.status}</Badge>
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-ink">大会情報</h2>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-body">{tournament.summary || "概要はまだ設定されていません。"}</p>
            <p className="mt-3 text-xs text-muted">あなたの役割: {role ?? "権限なし"}</p>
          </CardBody>
        </Card>

        {can(role, "tournament:publish") && (
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-ink">大会ステータス</h2>
            </CardHeader>
            <CardBody>
              <StatusControl tournamentId={tournament.id} currentStatus={tournament.status} />
            </CardBody>
          </Card>
        )}
      </div>

      {shortcuts.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-ink">メニュー</h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shortcuts.map((i) => (
              <li key={i.path}>
                <Link
                  href={`/tournaments/${tournament.id}${i.path}`}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-ink transition hover:border-border-strong hover:bg-surface-muted"
                >
                  {i.label}
                  <ArrowRight className="h-4 w-4 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
