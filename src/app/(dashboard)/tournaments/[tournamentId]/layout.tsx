import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { visibleNav } from "@/lib/tournament/nav";
import { TOURNAMENT_STATUS_LABEL } from "@/lib/tournament/status";
import { Badge } from "@/components/ui/Badge";
import { TournamentSidebar } from "./tournament-sidebar";

export default async function TournamentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);
  // Not staff of this tournament (or it does not exist): never reveal which.
  if (!role) notFound();

  const supabase = await createClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("name, slug, status")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!tournament) notFound();

  const groups = visibleNav(role);

  return (
    <div className="grid gap-6 lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <Link
          href="/dashboard"
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          大会一覧
        </Link>
        <div className="mb-4 rounded-xl border border-border bg-surface p-3">
          <p className="line-clamp-2 text-sm font-bold text-ink">{tournament.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted">/{tournament.slug}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="primary">{TOURNAMENT_STATUS_LABEL[tournament.status] ?? tournament.status}</Badge>
            <Badge>{role}</Badge>
          </div>
        </div>
        <TournamentSidebar tournamentId={tournamentId} groups={groups} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
