import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

export default async function AuditLogPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);

  if (!role) notFound();
  if (!can(role, "tournament:view_audit_log")) {
    redirect(`/tournaments/${tournamentId}`);
  }

  const supabase = await createClient();
  const { data: logs } = await supabase
    .from("audit_logs")
    .select("*, actor:actor_id ( display_name ), rounds ( name ), participants ( display_name )")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">監査ログ</h1>
        <a
          href={`/api/tournaments/${tournamentId}/export`}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          大会データを全てエクスポート(JSON)
        </a>
      </div>
      <p className="mb-6 text-sm text-slate-500">
        誰が・いつ・何を変更したかの記録です(直近200件)。得点操作の詳細な履歴は各ラウンドの得点操作画面から確認できます。
      </p>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">日時</th>
              <th className="px-4 py-3">操作者</th>
              <th className="px-4 py-3">ラウンド</th>
              <th className="px-4 py-3">参加者</th>
              <th className="px-4 py-3">内容</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(!logs || logs.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  まだ記録がありません
                </td>
              </tr>
            )}
            {(logs ?? []).map((log) => {
              const actor = log.actor as unknown as { display_name: string } | null;
              const round = log.rounds as unknown as { name: string } | null;
              const participant = log.participants as unknown as { display_name: string } | null;
              return (
                <tr key={log.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                    {new Date(log.created_at).toLocaleString("ja-JP")}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{actor?.display_name ?? "システム"}</td>
                  <td className="px-4 py-3 text-slate-500">{round?.name ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-500">{participant?.display_name ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-900">{log.summary}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
