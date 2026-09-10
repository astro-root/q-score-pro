import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { StatusControl } from "./status-control";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "下書き",
  REGISTRATION_OPEN: "エントリー受付中",
  REGISTRATION_CLOSED: "エントリー締切",
  RUNNING: "開催中",
  FINISHED: "終了",
  PUBLISHED: "結果公開",
};

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

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{tournament.name}</h1>
          <p className="text-sm text-slate-500">/{tournament.slug}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {STATUS_LABEL[tournament.status] ?? tournament.status}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">大会情報</h2>
          <p className="text-sm text-slate-600">
            {tournament.summary || "概要はまだ設定されていません。"}
          </p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">あなたの権限</h2>
          <p className="text-sm text-slate-600">{role ?? "権限なし"}</p>
        </section>

        {can(role, "tournament:manage_staff") && (
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">スタッフ管理</h2>
            <Link
              href={`/tournaments/${tournament.id}/members`}
              className="text-sm font-medium text-indigo-600 hover:underline"
            >
              スタッフ一覧・招待へ
            </Link>
          </section>
        )}

        {can(role, "tournament:publish") && (
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">大会ステータス</h2>
            <StatusControl tournamentId={tournament.id} currentStatus={tournament.status} />
          </section>
        )}
      </div>

      <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        エントリー・参加者管理・ラウンド管理・得点操作などは Phase 2 以降で実装予定です。
      </div>
    </div>
  );
}
