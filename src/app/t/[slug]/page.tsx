import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TOURNAMENT_STATUS_LABEL } from "@/lib/tournament/status";
import { entryClosedMessage, entryWindowState, formatEntryWindow, formatJst } from "@/lib/entries/window";
import { Markdown } from "@/components/Markdown";

// 公開ページに必要な列だけを取得する。select("*") だと owner_id(スタッフのユーザーID)など
// 管理用の列まで未認証の訪問者に渡ってしまう。
// 必ず単一の文字列リテラルにする。"a" + "b" で連結すると型が string になり、
// supabase-js が列の型を推論できず GenericStringError になる。
const PUBLIC_COLUMNS =
  "id, slug, name, status, summary, logo_url, main_visual_url, venue, organizer_name, contact_info, rules_content, notes, event_starts_at, event_ends_at, entry_starts_at, entry_ends_at, capacity, show_entry_count";

const fmtScore = (n: number | null) => (n === null ? "-" : Number.isInteger(n) ? String(n) : n.toFixed(1));

export default async function PublicTournamentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select(PUBLIC_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();

  if (!tournament) notFound();

  const [{ data: announcements }, { data: schedule }, { data: entryCount }, { data: results }] =
    await Promise.all([
      supabase
        .from("announcements")
        .select("id, title, body, created_at")
        .eq("tournament_id", tournament.id)
        .eq("is_published", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("schedule_items")
        .select("id, label, scheduled_at")
        .eq("tournament_id", tournament.id)
        .order("sort_order", { ascending: true }),
      supabase.rpc("public_entry_count", { p_slug: slug }),
      tournament.status === "PUBLISHED"
        ? supabase.rpc("public_tournament_results", { p_slug: slug })
        : Promise.resolve({ data: null }),
    ]);

  const windowInput = {
    status: tournament.status,
    opensAt: tournament.entry_starts_at,
    closesAt: tournament.entry_ends_at,
  };
  const entryState = entryWindowState(windowInput, new Date());
  const windowText = formatEntryWindow(tournament.entry_starts_at, tournament.entry_ends_at);

  // 結果をラウンドごとにまとめる(関数側で並び順は確定済み)
  const rounds: { id: string; name: string; rows: NonNullable<typeof results> }[] = [];
  for (const row of results ?? []) {
    let r = rounds.find((x) => x.id === row.round_id);
    if (!r) {
      r = { id: row.round_id, name: row.round_name, rows: [] };
      rounds.push(r);
    }
    r.rows.push(row);
  }

  const sections: { id: string; label: string; show: boolean }[] = [
    { id: "results", label: "結果", show: rounds.length > 0 },
    { id: "overview", label: "概要", show: !!tournament.summary },
    { id: "info", label: "開催情報", show: !!(tournament.event_starts_at || tournament.venue || windowText || tournament.capacity || entryCount !== null) },
    { id: "schedule", label: "スケジュール", show: !!schedule && schedule.length > 0 },
    { id: "rules", label: "ルール", show: !!tournament.rules_content },
    { id: "notes", label: "注意事項", show: !!tournament.notes },
    { id: "news", label: "お知らせ", show: !!announcements && announcements.length > 0 },
    { id: "contact", label: "問い合わせ", show: !!tournament.contact_info },
  ];
  const nav = sections.filter((s) => s.show);

  const h2 = "mb-3 text-lg font-bold text-ink";
  const card = "rounded-xl border border-border bg-surface p-4 sm:p-5";

  return (
    <div className="min-h-screen bg-surface-muted pb-16">
      {tournament.main_visual_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={tournament.main_visual_url} alt="" className="h-48 w-full object-cover sm:h-72" />
      )}

      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
        {tournament.status === "CANCELLED" && (
          <div role="status" className="mb-6 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
            この大会は中止されました。
          </div>
        )}

        <header className="mb-6 flex items-start gap-4">
          {tournament.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tournament.logo_url} alt="" className="h-16 w-16 shrink-0 rounded-xl border border-border bg-surface object-contain p-1" />
          )}
          <div className="min-w-0">
            <span className="mb-1 inline-block rounded-full bg-primary-soft px-3 py-0.5 text-xs font-medium text-primary">
              {TOURNAMENT_STATUS_LABEL[tournament.status] ?? tournament.status}
            </span>
            <h1 className="break-words text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{tournament.name}</h1>
            {tournament.organizer_name && <p className="mt-1 text-sm text-muted">主催: {tournament.organizer_name}</p>}
          </div>
        </header>

        {/* エントリーの導線: 受付期間と連動(DBの受付条件と同じ判定) */}
        {entryState === "open" && (
          <div className="mb-6 rounded-xl border border-primary/30 bg-primary-soft p-5">
            <p className="mb-3 text-sm text-ink">現在エントリーを受け付けています。</p>
            <Link
              href={`/t/${slug}/entry`}
              className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-hover sm:w-auto"
            >
              エントリーする
            </Link>
          </div>
        )}
        {(entryState === "not_open_yet" || entryState === "deadline_passed") && (
          <div role="status" className="mb-6 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-body">
            {entryClosedMessage(entryState, windowInput)}
          </div>
        )}
        {tournament.status === "REGISTRATION_CLOSED" && (
          <div role="status" className="mb-6 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-body">
            エントリーの受付は終了しました。
          </div>
        )}

        {nav.length > 1 && (
          <nav aria-label="ページ内メニュー" className="-mx-4 mb-6 overflow-x-auto px-4">
            <ul className="flex gap-2 whitespace-nowrap">
              {nav.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="inline-block rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-body hover:bg-surface-muted">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {rounds.length > 0 && (
          <section id="results" className="mb-8 scroll-mt-4">
            <h2 className={h2}>大会結果</h2>
            <div className="flex flex-col gap-4">
              {rounds.map((r) => (
                <div key={r.id} className="overflow-hidden rounded-xl border border-border bg-surface">
                  <h3 className="border-b border-border bg-surface-muted px-4 py-2.5 text-sm font-bold text-ink">{r.name}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs text-muted">
                        <tr>
                          <th className="px-4 py-2 font-semibold">順位</th>
                          <th className="px-4 py-2 font-semibold">参加者</th>
                          <th className="px-4 py-2 text-right font-semibold">得点</th>
                          <th className="px-4 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {r.rows.map((row, i) => (
                          <tr key={`${row.rank}-${row.display_name}-${i}`} className={row.passed ? "bg-success-soft/40" : ""}>
                            <td className="font-score px-4 py-2 font-bold text-ink">{row.rank}</td>
                            <td className="px-4 py-2">
                              <span className="font-medium text-ink">{row.display_name}</span>
                              {row.affiliation && <span className="ml-2 text-xs text-muted">{row.affiliation}</span>}
                            </td>
                            <td className="font-score px-4 py-2 text-right font-bold">{fmtScore(row.score)}</td>
                            <td className="px-4 py-2 text-right">
                              {row.passed && <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">通過</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {tournament.summary && (
          <section id="overview" className="mb-8 scroll-mt-4">
            <h2 className={h2}>大会概要</h2>
            <div className={card}>
              <Markdown source={tournament.summary} />
            </div>
          </section>
        )}

        {sections.find((s) => s.id === "info")?.show && (
          <section id="info" className="mb-8 grid scroll-mt-4 gap-4 sm:grid-cols-2">
            {(tournament.event_starts_at || tournament.venue) && (
              <div className={card}>
                <h3 className="mb-1 text-xs font-semibold text-muted">開催情報</h3>
                {tournament.event_starts_at && (
                  <p className="text-sm text-body">
                    {formatJst(tournament.event_starts_at)}
                    {tournament.event_ends_at && ` 〜 ${formatJst(tournament.event_ends_at)}`}
                    <span className="ml-1 text-xs text-muted">(日本時間)</span>
                  </p>
                )}
                {tournament.venue && <p className="text-sm text-body">{tournament.venue}</p>}
              </div>
            )}
            {(windowText || tournament.capacity || entryCount !== null) && (
              <div className={card}>
                <h3 className="mb-1 text-xs font-semibold text-muted">エントリー情報</h3>
                {windowText && <p className="text-sm text-body">受付期間: {windowText}<span className="ml-1 text-xs text-muted">(日本時間)</span></p>}
                {entryCount !== null && (
                  <p className="text-sm text-body">
                    エントリー済み: <strong className="font-score text-ink">{entryCount}</strong>名
                    {tournament.capacity ? ` / 定員 ${tournament.capacity}名` : ""}
                  </p>
                )}
                {entryCount === null && tournament.capacity && <p className="text-sm text-body">定員: {tournament.capacity}名</p>}
                {entryCount !== null && tournament.capacity ? (
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, (entryCount / tournament.capacity) * 100)}%` }} />
                  </div>
                ) : null}
              </div>
            )}
          </section>
        )}

        {schedule && schedule.length > 0 && (
          <section id="schedule" className="mb-8 scroll-mt-4">
            <h2 className={h2}>スケジュール</h2>
            <ul className="overflow-hidden rounded-xl border border-border bg-surface">
              {schedule.map((item) => (
                <li key={item.id} className="flex flex-col gap-0.5 border-b border-border px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:gap-3">
                  <span className="shrink-0 text-xs text-muted sm:w-40">{item.scheduled_at ? formatJst(item.scheduled_at) : ""}</span>
                  <span className="text-sm text-ink">{item.label}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tournament.rules_content && (
          <section id="rules" className="mb-8 scroll-mt-4">
            <h2 className={h2}>ルール</h2>
            <div className={card}>
              <Markdown source={tournament.rules_content} />
            </div>
          </section>
        )}

        {tournament.notes && (
          <section id="notes" className="mb-8 scroll-mt-4">
            <h2 className={h2}>注意事項</h2>
            <div className={card}>
              <Markdown source={tournament.notes} />
            </div>
          </section>
        )}

        {announcements && announcements.length > 0 && (
          <section id="news" className="mb-8 scroll-mt-4">
            <h2 className={h2}>お知らせ</h2>
            <ul className="flex flex-col gap-3">
              {announcements.map((a) => (
                <li key={a.id} className={card}>
                  <p className="mb-1 text-sm font-bold text-ink">{a.title}</p>
                  <Markdown source={a.body} />
                  <p className="mt-2 text-xs text-muted">{formatJst(a.created_at)}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tournament.contact_info && (
          <section id="contact" className="mb-8 scroll-mt-4">
            <h2 className={h2}>問い合わせ先</h2>
            <div className={card}>
              <Markdown source={tournament.contact_info} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
