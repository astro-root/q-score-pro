import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { EntrySearchBar } from "./entry-search-bar";

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "エントリー済み",
  WITHDRAWN: "辞退",
};

export default async function EntriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tournamentId: string }>;
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { tournamentId } = await params;
  const { q, status } = await searchParams;
  const role = await getTournamentRole(tournamentId);

  if (!role) notFound();
  if (!can(role, "tournament:manage_entries")) {
    redirect(`/tournaments/${tournamentId}`);
  }

  const supabase = await createClient();

  const { data: fields } = await supabase
    .from("entry_form_fields")
    .select("field_key, label")
    .eq("tournament_id", tournamentId)
    .order("sort_order", { ascending: true });

  let query = supabase
    .from("entries")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("submitted_at", { ascending: false });

  if (status === "SUBMITTED" || status === "WITHDRAWN") {
    query = query.eq("status", status);
  }
  if (q) {
    query = query.or(`display_name.ilike.%${q}%,email.ilike.%${q}%,affiliation.ilike.%${q}%`);
  }

  const { data: entries } = await query;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">エントリー一覧</h1>
        <span className="text-sm text-slate-500">{entries?.length ?? 0} 件</span>
      </div>

      <EntrySearchBar tournamentId={tournamentId} />

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">表示名</th>
              <th className="px-4 py-3">メールアドレス</th>
              <th className="px-4 py-3">所属</th>
              {(fields ?? []).map((f) => (
                <th key={f.field_key} className="px-4 py-3">
                  {f.label}
                </th>
              ))}
              <th className="px-4 py-3">ステータス</th>
              <th className="px-4 py-3">エントリー日時</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(entries ?? []).length === 0 && (
              <tr>
                <td colSpan={5 + (fields?.length ?? 0)} className="px-4 py-8 text-center text-slate-400">
                  該当するエントリーがありません
                </td>
              </tr>
            )}
            {(entries ?? []).map((e) => {
              const answers = e.answers as Record<string, unknown>;
              return (
                <tr key={e.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{e.display_name}</td>
                  <td className="px-4 py-3 text-slate-600">{e.email}</td>
                  <td className="px-4 py-3 text-slate-600">{e.affiliation ?? "-"}</td>
                  {(fields ?? []).map((f) => (
                    <td key={f.field_key} className="px-4 py-3 text-slate-600">
                      {String(answers?.[f.field_key] ?? "-")}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {STATUS_LABEL[e.status] ?? e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(e.submitted_at).toLocaleString("ja-JP")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
