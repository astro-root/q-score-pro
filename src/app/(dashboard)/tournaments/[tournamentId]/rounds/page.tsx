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
        <h1 className="text-2xl font-bold text-slate-900">ラウンド管理</h1>
        {can(role, "tournament:manage_rounds") && (
          <Link
            href={`/tournaments/${tournamentId}/rounds/new`}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            ラウンドを作成
          </Link>
        )}
      </div>

      {!rounds || rounds.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
          まだラウンドがありません。
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {rounds.map((r) => (
            <li key={r.id}>
              <Link
                href={`/tournaments/${tournamentId}/rounds/${r.id}`}
                className="flex items-center justify-between px-5 py-4 transition hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-slate-900">{r.name}</p>
                  <p className="text-xs text-slate-500">
                    {TYPE_LABEL[r.round_type]}
                    {r.advance_count ? ` ・ 通過 ${r.advance_count}名` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
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
