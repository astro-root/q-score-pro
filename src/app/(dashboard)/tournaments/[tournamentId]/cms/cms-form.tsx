"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Database } from "@/types/database";

type Tournament = Database["public"]["Tables"]["tournaments"]["Row"];

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoOrNull(local: string): string | null {
  if (!local) return null;
  return new Date(local).toISOString();
}

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
    eventStartsAt: toLocalInputValue(tournament.event_starts_at),
    eventEndsAt: toLocalInputValue(tournament.event_ends_at),
    entryStartsAt: toLocalInputValue(tournament.entry_starts_at),
    entryEndsAt: toLocalInputValue(tournament.entry_ends_at),
    capacity: tournament.capacity ? String(tournament.capacity) : "",
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
        eventStartsAt: toIsoOrNull(form.eventStartsAt),
        eventEndsAt: toIsoOrNull(form.eventEndsAt),
        entryStartsAt: toIsoOrNull(form.entryStartsAt),
        entryEndsAt: toIsoOrNull(form.entryEndsAt),
        capacity: form.capacity ? Number(form.capacity) : null,
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
    "rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-sm font-medium text-slate-700">大会名</label>
          <input {...field("name")} required className={inputClass} />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-sm font-medium text-slate-700">大会概要</label>
          <textarea {...field("summary")} rows={3} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">ロゴ画像URL</label>
          <input {...field("logoUrl")} type="url" placeholder="https://..." className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">メインビジュアルURL</label>
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
          <label className="text-sm font-medium text-slate-700">開催場所</label>
          <input {...field("venue")} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">主催者</label>
          <input {...field("organizerName")} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-sm font-medium text-slate-700">問い合わせ先</label>
          <input {...field("contactInfo")} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">開催日時(開始)</label>
          <input {...field("eventStartsAt")} type="datetime-local" className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">開催日時(終了)</label>
          <input {...field("eventEndsAt")} type="datetime-local" className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">エントリー期間(開始)</label>
          <input {...field("entryStartsAt")} type="datetime-local" className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">エントリー期間(終了)</label>
          <input {...field("entryEndsAt")} type="datetime-local" className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">定員</label>
          <input {...field("capacity")} type="number" min={1} className={inputClass} />
        </div>
      </section>

      <section className="grid gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">ルール(Markdown可)</label>
          <textarea {...field("rulesContent")} rows={8} className={`${inputClass} font-mono`} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">注意事項</label>
          <textarea {...field("notes")} rows={4} className={inputClass} />
        </div>
      </section>

      {message && (
        <p className={`text-sm ${message.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
      >
        {pending ? "保存中..." : "保存"}
      </button>
    </form>
  );
}
