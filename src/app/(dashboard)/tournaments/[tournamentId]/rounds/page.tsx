import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "未開始",
  RUNNING: "進行中",
  PAUSED: "一時停止",
  FINISHED: "終了",
};

const TYPE_LABEL: Record<string, string> = {
  PAPER: "ペーパークイズ",
  BUZZER: "早押しクイズ",
};

export default async function RoundsPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);

  if (!role) notFound();
  if (!can(role, "tournament:view")) {
    redirect(`/tournaments/${tournamentId}`);
  }

  const supabase = await createClient();
  const { data: rounds } = await supabase
    .from("rounds")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("sort_order", { ascending: true });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">ラウンド管理</h1>
        {can(role, "tournament:manage_rounds") && (
          <Link
            href={`/tournaments/${tournamentId}/rounds/new`}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover"
          >
            ラウンドを作成
          </Link>
        )}
      </div>

      {!rounds || rounds.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface p-12 text-center text-muted">
          まだラウンドがありません。
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {rounds.map((r) => (
            <li key={r.id}>
              <Link
                href={`/tournaments/${tournamentId}/rounds/${r.id}`}
                className="flex items-center justify-between px-5 py-4 transition hover:bg-canvas"
              >
                <div>
                  <p className="font-medium text-ink">{r.name}</p>
                  <p className="text-xs text-muted">
                    {TYPE_LABEL[r.round_type]}
                    {r.advance_count ? ` ・ 通過 ${r.advance_count}名` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-body">
                  {STATUS_LABEL[r.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
