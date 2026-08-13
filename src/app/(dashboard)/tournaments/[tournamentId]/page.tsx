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

        {can(role, "tournament:manage_cms") && (
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">大会ページ・公開情報</h2>
            <div className="flex flex-col gap-1 text-sm">
              <Link href={`/tournaments/${tournament.id}/cms`} className="font-medium text-indigo-600 hover:underline">
                大会ページ編集
              </Link>
              <Link
                href={`/tournaments/${tournament.id}/announcements`}
                className="font-medium text-indigo-600 hover:underline"
              >
                お知らせ管理
              </Link>
              <Link
                href={`/tournaments/${tournament.id}/schedule`}
                className="font-medium text-indigo-600 hover:underline"
              >
                スケジュール管理
              </Link>
              <Link
                href={`/tournaments/${tournament.id}/entry-fields`}
                className="font-medium text-indigo-600 hover:underline"
              >
                エントリーフォーム項目設定
              </Link>
              <Link
                href={`/tournaments/${tournament.id}/layouts`}
                className="font-medium text-indigo-600 hover:underline"
              >
                得点表示画面レイアウト編集
              </Link>
              <a
                href={`/t/${tournament.slug}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-slate-500 hover:underline"
              >
                公開ページを見る ↗
              </a>
            </div>
          </section>
        )}

        {can(role, "tournament:manage_entries") && (
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">エントリー管理</h2>
            <Link
              href={`/tournaments/${tournament.id}/entries`}
              className="text-sm font-medium text-indigo-600 hover:underline"
            >
              エントリー一覧・CSVエクスポート
            </Link>
          </section>
        )}

        {can(role, "tournament:manage_participants") && (
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">参加者管理</h2>
            <Link
              href={`/tournaments/${tournament.id}/participants`}
              className="text-sm font-medium text-indigo-600 hover:underline"
            >
              参加者一覧・エントリーからの取り込み
            </Link>
          </section>
        )}

        {can(role, "tournament:view") && (
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">ラウンド・得点</h2>
            <div className="flex flex-col gap-1 text-sm">
              <Link href={`/tournaments/${tournament.id}/rounds`} className="font-medium text-indigo-600 hover:underline">
                ラウンド管理・ペーパークイズ採点・組分け
              </Link>
              {can(role, "tournament:manage_rounds") && (
                <Link
                  href={`/tournaments/${tournament.id}/stages`}
                  className="font-medium text-indigo-600 hover:underline"
                >
                  ステージ管理
                </Link>
              )}
            </div>
          </section>
        )}

        {can(role, "tournament:view_audit_log") && (
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">監査ログ・バックアップ</h2>
            <div className="flex flex-col gap-1 text-sm">
              <Link
                href={`/tournaments/${tournament.id}/audit-log`}
                className="font-medium text-indigo-600 hover:underline"
              >
                監査ログを確認
              </Link>
              <a
                href={`/api/tournaments/${tournament.id}/export`}
                className="font-medium text-indigo-600 hover:underline"
              >
                大会データをエクスポート(JSON)
              </a>
            </div>
          </section>
        )}

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
        自動テスト・負荷検証・UX改善などは Phase 9 で継続して取り組みます。
      </div>
    </div>
  );
}
