import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "下書き",
  REGISTRATION_OPEN: "エントリー受付中",
  REGISTRATION_CLOSED: "エントリー締切",
  RUNNING: "開催中",
  FINISHED: "終了",
  PUBLISHED: "結果公開",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: memberships } = await supabase
    .from("tournament_members")
    .select("role, tournaments ( id, slug, name, status, updated_at )")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">大会一覧</h1>
        <Link
          href="/tournaments/new"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          新しい大会を作成
        </Link>
      </div>

      {!memberships || memberships.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
          まだ大会がありません。「新しい大会を作成」から始めましょう。
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {memberships.map((m) => {
            const t = m.tournaments as unknown as {
              id: string;
              slug: string;
              name: string;
              status: string;
              updated_at: string;
            } | null;
            if (!t) return null;
            return (
              <li key={t.id}>
                <Link
                  href={`/tournaments/${t.id}`}
                  className="flex items-center justify-between px-5 py-4 transition hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-500">/{t.slug}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                    <span className="text-xs text-slate-400">{m.role}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
