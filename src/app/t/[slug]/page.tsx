import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TOURNAMENT_STATUS_LABEL } from "@/lib/tournament/status";

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
    <div className="min-h-screen bg-surface-muted">
      {tournament.main_visual_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tournament.main_visual_url}
          alt=""
          className="h-56 w-full object-cover sm:h-72"
        />
      )}

      <div className="mx-auto max-w-3xl px-4 py-10">
        {tournament.status === "CANCELLED" && (
          <div
            role="status"
            className="mb-6 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
          >
            この大会は中止されました。
          </div>
        )}

        <div className="mb-8 flex items-start gap-4">
          {tournament.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tournament.logo_url}
              alt=""
              className="h-16 w-16 shrink-0 rounded-lg border border-border bg-surface object-contain p-1"
            />
          )}
          <div>
            <span className="mb-1 inline-block rounded-full bg-primary-soft px-3 py-0.5 text-xs font-medium text-primary">
              {TOURNAMENT_STATUS_LABEL[tournament.status] ?? tournament.status}
            </span>
            <h1 className="text-3xl font-bold text-ink">{tournament.name}</h1>
            {tournament.organizer_name && (
              <p className="mt-1 text-sm text-muted">主催: {tournament.organizer_name}</p>
            )}
          </div>
        </div>

        {canEnter && (
          <div className="mb-8 rounded-lg border border-primary/30 bg-primary-soft p-5">
            <p className="mb-3 text-sm text-ink">現在エントリーを受け付けています。</p>
            <Link
              href={`/t/${slug}/entry`}
              className="inline-block rounded-md bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover"
            >
              エントリーする
            </Link>
          </div>
        )}

        {tournament.summary && (
          <section className="mb-8">
            <h2 className="mb-2 text-lg font-semibold text-ink">大会概要</h2>
            <p className="whitespace-pre-wrap text-sm text-body">{tournament.summary}</p>
          </section>
        )}

        <section className="mb-8 grid gap-4 sm:grid-cols-2">
          {(tournament.event_starts_at || tournament.venue) && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <h3 className="mb-1 text-xs font-semibold uppercase text-muted">開催情報</h3>
              {tournament.event_starts_at && (
                <p className="text-sm text-body">
                  {new Date(tournament.event_starts_at).toLocaleString("ja-JP")}
                  {tournament.event_ends_at &&
                    ` 〜 ${new Date(tournament.event_ends_at).toLocaleString("ja-JP")}`}
                </p>
              )}
              {tournament.venue && <p className="text-sm text-body">{tournament.venue}</p>}
            </div>
          )}
          {(tournament.entry_starts_at || tournament.capacity) && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <h3 className="mb-1 text-xs font-semibold uppercase text-muted">エントリー情報</h3>
              {tournament.entry_starts_at && (
                <p className="text-sm text-body">
                  {new Date(tournament.entry_starts_at).toLocaleString("ja-JP")}
                  {tournament.entry_ends_at &&
                    ` 〜 ${new Date(tournament.entry_ends_at).toLocaleString("ja-JP")}`}
                </p>
              )}
              {tournament.capacity && (
                <p className="text-sm text-body">定員: {tournament.capacity}名</p>
              )}
            </div>
          )}
        </section>

        {schedule && schedule.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-2 text-lg font-semibold text-ink">スケジュール</h2>
            <ul className="rounded-lg border border-border bg-surface">
              {schedule.map((item) => (
                <li key={item.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                  <span className="w-40 shrink-0 text-xs text-muted">
                    {item.scheduled_at ? new Date(item.scheduled_at).toLocaleString("ja-JP") : ""}
                  </span>
                  <span className="text-sm text-ink">{item.label}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tournament.rules_content && (
          <section className="mb-8">
            <h2 className="mb-2 text-lg font-semibold text-ink">ルール</h2>
            <p className="whitespace-pre-wrap text-sm text-body">{tournament.rules_content}</p>
          </section>
        )}

        {tournament.notes && (
          <section className="mb-8">
            <h2 className="mb-2 text-lg font-semibold text-ink">注意事項</h2>
            <p className="whitespace-pre-wrap text-sm text-body">{tournament.notes}</p>
          </section>
        )}

        {announcements && announcements.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-2 text-lg font-semibold text-ink">お知らせ</h2>
            <ul className="flex flex-col gap-3">
              {announcements.map((a) => (
                <li key={a.id} className="rounded-lg border border-border bg-surface p-4">
                  <p className="mb-1 text-sm font-medium text-ink">{a.title}</p>
                  <p className="whitespace-pre-wrap text-sm text-body">{a.body}</p>
                  <p className="mt-2 text-xs text-muted">
                    {new Date(a.created_at).toLocaleString("ja-JP")}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tournament.contact_info && (
          <section className="mb-8">
            <h2 className="mb-2 text-lg font-semibold text-ink">問い合わせ先</h2>
            <p className="text-sm text-body">{tournament.contact_info}</p>
          </section>
        )}
      </div>
    </div>
  );
}
