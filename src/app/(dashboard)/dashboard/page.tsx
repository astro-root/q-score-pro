import Link from "next/link";
import { Plus, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TOURNAMENT_STATUS_LABEL } from "@/lib/tournament/status";
import type { TournamentStatus } from "@/types/database";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "live";

const STATUS_TONE: Record<TournamentStatus, Tone> = {
  DRAFT: "neutral",
  REGISTRATION_OPEN: "primary",
  REGISTRATION_CLOSED: "warning",
  RUNNING: "live",
  FINISHED: "success",
  PUBLISHED: "success",
  CANCELLED: "danger",
};

interface TournamentRow {
  id: string;
  slug: string;
  name: string;
  status: TournamentStatus;
  updated_at: string;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: memberships, error } = await supabase
    .from("tournament_members")
    .select("role, tournaments ( id, slug, name, status, updated_at )")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const rows = (memberships ?? [])
    .map((m) => ({ role: m.role as string, t: m.tournaments as unknown as TournamentRow | null }))
    .filter((r): r is { role: string; t: TournamentRow } => r.t !== null);

  return (
    <div>
      <PageHeader
        title="大会一覧"
        description="あなたがスタッフとして参加している大会です。"
        actions={
          <LinkButton href="/tournaments/new" icon={<Plus className="h-4 w-4" />}>
            新しい大会を作成
          </LinkButton>
        }
      />

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          大会一覧を取得できませんでした: {error.message}
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-8 w-8" />}
          title="まだ大会がありません"
          description="「新しい大会を作成」から、最初の大会を始めましょう。スタッフとして招待された大会もここに表示されます。"
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ role, t }) => (
            <li key={t.id}>
              <Link href={`/tournaments/${t.id}`} className="block h-full">
                <Card className="h-full p-4 transition hover:border-border-strong hover:shadow-md">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <Badge tone={STATUS_TONE[t.status] ?? "neutral"} dot={t.status === "RUNNING"}>
                      {TOURNAMENT_STATUS_LABEL[t.status] ?? t.status}
                    </Badge>
                    <span className="text-xs font-medium text-muted">{role}</span>
                  </div>
                  <p className="line-clamp-2 font-bold text-ink">{t.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">/{t.slug}</p>
                  <p className="mt-3 text-xs text-muted">
                    最終更新 {new Date(t.updated_at).toLocaleDateString("ja-JP")}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
