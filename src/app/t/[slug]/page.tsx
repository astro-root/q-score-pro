import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const STATUS_LABEL: Record<string, string> = {
  REGISTRATION_OPEN: "エントリー受付中",
  REGISTRATION_CLOSED: "エントリー締切",
  RUNNING: "開催中",
  FINISHED: "終了",
  PUBLISHED: "結果公開",
};

export default async function PublicTournamentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!tournament) notFound();

  const [{ data: announcements }, { data: schedule }] = await Promise.all([
    supabase
      .from("announcements")
      .select("*")
      .eq("tournament_id", tournament.id)
      .eq("is_published", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("schedule_items")
      .select("*")
      .eq("tournament_id", tournament.id)
      .order("sort_order", { ascending: true }),
  ]);

  const canEnter = tournament.status === "REGISTRATION_OPEN";

  return (
    <div className="min-h-screen bg-slate-50">
      {tournament.main_visual_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tournament.main_visual_url}
          alt=""
          className="h-56 w-full object-cover sm:h-72"
        />
      )}

      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8 flex items-start gap-4">
          {tournament.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tournament.logo_url}
              alt=""
              className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-1"
            />
          )}
          <div>
            <span className="mb-1 inline-block rounded-full bg-indigo-100 px-3 py-0.5 text-xs font-medium text-indigo-700">
              {STATUS_LABEL[tournament.status] ?? tournament.status}
            </span>
            <h1 className="text-3xl font-bold text-slate-900">{tournament.name}</h1>
            {tournament.organizer_name && (
              <p className="mt-1 text-sm text-slate-500">主催: {tournament.organizer_name}</p>
            )}
          </div>
        </div>

        {canEnter && (
          <div className="mb-8 rounded-lg border border-indigo-200 bg-indigo-50 p-5">
            <p className="mb-3 text-sm text-indigo-900">現在エントリーを受け付けています。</p>
            <Link
              href={`/t/${slug}/entry`}
              className="inline-block rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              エントリーする
            </Link>
          </div>
        )}

        {tournament.summary && (
          <section className="mb-8">
            <h2 className="mb-2 text-lg font-semibold text-slate-900">大会概要</h2>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{tournament.summary}</p>
          </section>
        )}

        <section className="mb-8 grid gap-4 sm:grid-cols-2">
          {(tournament.event_starts_at || tournament.venue) && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="mb-1 text-xs font-semibold uppercase text-slate-400">開催情報</h3>
              {tournament.event_starts_at && (
                <p className="text-sm text-slate-700">
                  {new Date(tournament.event_starts_at).toLocaleString("ja-JP")}
                  {tournament.event_ends_at &&
                    ` 〜 ${new Date(tournament.event_ends_at).toLocaleString("ja-JP")}`}
                </p>
              )}
              {tournament.venue && <p className="text-sm text-slate-700">{tournament.venue}</p>}
            </div>
          )}
          {(tournament.entry_starts_at || tournament.capacity) && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="mb-1 text-xs font-semibold uppercase text-slate-400">エントリー情報</h3>
              {tournament.entry_starts_at && (
                <p className="text-sm text-slate-700">
                  {new Date(tournament.entry_starts_at).toLocaleString("ja-JP")}
                  {tournament.entry_ends_at &&
                    ` 〜 ${new Date(tournament.entry_ends_at).toLocaleString("ja-JP")}`}
                </p>
              )}
              {tournament.capacity && (
                <p className="text-sm text-slate-700">定員: {tournament.capacity}名</p>
              )}
            </div>
          )}
        </section>

        {schedule && schedule.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-2 text-lg font-semibold text-slate-900">スケジュール</h2>
            <ul className="rounded-lg border border-slate-200 bg-white">
              {schedule.map((item) => (
                <li key={item.id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                  <span className="w-40 shrink-0 text-xs text-slate-500">
                    {item.scheduled_at ? new Date(item.scheduled_at).toLocaleString("ja-JP") : ""}
                  </span>
                  <span className="text-sm text-slate-800">{item.label}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tournament.rules_content && (
          <section className="mb-8">
            <h2 className="mb-2 text-lg font-semibold text-slate-900">ルール</h2>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{tournament.rules_content}</p>
          </section>
        )}

        {tournament.notes && (
          <section className="mb-8">
            <h2 className="mb-2 text-lg font-semibold text-slate-900">注意事項</h2>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{tournament.notes}</p>
          </section>
        )}

        {announcements && announcements.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-2 text-lg font-semibold text-slate-900">お知らせ</h2>
            <ul className="flex flex-col gap-3">
              {announcements.map((a) => (
                <li key={a.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="mb-1 text-sm font-medium text-slate-900">{a.title}</p>
                  <p className="whitespace-pre-wrap text-sm text-slate-600">{a.body}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    {new Date(a.created_at).toLocaleString("ja-JP")}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tournament.contact_info && (
          <section className="mb-8">
            <h2 className="mb-2 text-lg font-semibold text-slate-900">問い合わせ先</h2>
            <p className="text-sm text-slate-700">{tournament.contact_info}</p>
          </section>
        )}
      </div>
    </div>
  );
}
