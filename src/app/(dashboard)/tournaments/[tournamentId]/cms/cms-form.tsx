"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Database } from "@/types/database";
import { fromJstInputValue, toJstInputValue } from "@/lib/entries/window";

type Tournament = Database["public"]["Tables"]["tournaments"]["Row"];

export function CmsForm({ tournament }: { tournament: Tournament }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: tournament.name,
    summary: tournament.summary ?? "",
    logoUrl: tournament.logo_url ?? "",
    mainVisualUrl: tournament.main_visual_url ?? "",
    venue: tournament.venue ?? "",
    organizerName: tournament.organizer_name ?? "",
    contactInfo: tournament.contact_info ?? "",
    rulesContent: tournament.rules_content ?? "",
    notes: tournament.notes ?? "",
    eventStartsAt: toJstInputValue(tournament.event_starts_at),
    eventEndsAt: toJstInputValue(tournament.event_ends_at),
    capacity: tournament.capacity ? String(tournament.capacity) : "",
    showEntryCount: tournament.show_entry_count,
  });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  function field<K extends keyof typeof form>(key: K) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value })),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setMessage(null);

    const res = await fetch(`/api/tournaments/${tournament.id}/cms`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        summary: form.summary || null,
        logoUrl: form.logoUrl || null,
        mainVisualUrl: form.mainVisualUrl || null,
        venue: form.venue || null,
        organizerName: form.organizerName || null,
        contactInfo: form.contactInfo || null,
        rulesContent: form.rulesContent || null,
        notes: form.notes || null,
        eventStartsAt: form.eventStartsAt ? fromJstInputValue(form.eventStartsAt) : null,
        eventEndsAt: form.eventEndsAt ? fromJstInputValue(form.eventEndsAt) : null,
        capacity: form.capacity ? Number(form.capacity) : null,
        showEntryCount: form.showEntryCount,
      }),
    });

    setPending(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMessage({ type: "error", text: body.message ?? "保存に失敗しました" });
      return;
    }

    setMessage({ type: "ok", text: "保存しました" });
    router.refresh();
  }

  const inputClass =
    "rounded-md border border-border-strong px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary-hover";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-sm font-medium text-body">大会名</label>
          <input {...field("name")} required className={inputClass} />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-sm font-medium text-body">大会概要(Markdown可)</label>
          <textarea {...field("summary")} rows={3} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-body">ロゴ画像URL</label>
          <input {...field("logoUrl")} type="url" placeholder="https://..." className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-body">メインビジュアルURL</label>
          <input
            {...field("mainVisualUrl")}
            type="url"
            placeholder="https://..."
            className={inputClass}
          />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-body">開催場所</label>
          <input {...field("venue")} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-body">主催者</label>
          <input {...field("organizerName")} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-sm font-medium text-body">問い合わせ先</label>
          <input {...field("contactInfo")} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-body">開催日時(開始・日本時間)</label>
          <input {...field("eventStartsAt")} type="datetime-local" className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-body">開催日時(終了・日本時間)</label>
          <input {...field("eventEndsAt")} type="datetime-local" className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-body">定員</label>
          <input {...field("capacity")} type="number" min={1} className={inputClass} />
        </div>
        <label className="flex items-start gap-2 text-sm text-body sm:col-span-2">
          <input
            type="checkbox"
            checked={form.showEntryCount}
            onChange={(e) => setForm((f) => ({ ...f, showEntryCount: e.target.checked }))}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            公開ページにエントリー状況(件数・定員)を表示する
            <span className="block text-xs text-muted">
              エントリーの受付期間は「エントリーフォーム」の画面で設定します(公開フォームの受付可否にも使われます)。
            </span>
          </span>
        </label>
      </section>

      <section className="grid gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-body">ルール(Markdown可: 見出し # / 箇条書き - / **太字** / [リンク](https://...))</label>
          <textarea {...field("rulesContent")} rows={8} className={`${inputClass} font-mono`} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-body">注意事項(Markdown可)</label>
          <textarea {...field("notes")} rows={4} className={inputClass} />
        </div>
      </section>

      {message && (
        <p className={`text-sm ${message.type === "ok" ? "text-success" : "text-danger"}`}>
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "保存中..." : "保存"}
      </button>
    </form>
  );
}
