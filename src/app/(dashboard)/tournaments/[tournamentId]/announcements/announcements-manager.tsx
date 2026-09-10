"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Database } from "@/types/database";

type Announcement = Database["public"]["Tables"]["announcements"]["Row"];

export function AnnouncementsManager({
  tournamentId,
  initialAnnouncements,
}: {
  tournamentId: string;
  initialAnnouncements: Announcement[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const res = await fetch(`/api/tournaments/${tournamentId}/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });

    setPending(false);

    if (!res.ok) {
      setError("投稿に失敗しました");
      return;
    }

    setTitle("");
    setBody("");
    router.refresh();
  }

  async function togglePublish(a: Announcement) {
    await fetch(`/api/tournaments/${tournamentId}/announcements/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: !a.is_published }),
    });
    router.refresh();
  }

  async function remove(a: Announcement) {
    if (!confirm(`「${a.title}」を削除しますか?`)) return;
    await fetch(`/api/tournaments/${tournamentId}/announcements/${a.id}`, {
      method: "DELETE",
    });
    router.refresh();
  }

  const inputClass =
    "rounded-md border border-border-strong px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary-hover";

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5"
      >
        <h2 className="text-sm font-semibold text-body">お知らせを投稿</h2>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="タイトル"
          className={inputClass}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={3}
          placeholder="本文"
          className={inputClass}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "投稿中..." : "投稿"}
        </button>
      </form>

      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {initialAnnouncements.length === 0 && (
          <li className="p-6 text-center text-sm text-muted">まだお知らせはありません</li>
        )}
        {initialAnnouncements.map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-4 px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-ink">{a.title}</p>
                {!a.is_published && (
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted">
                    非公開
                  </span>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-body">{a.body}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => togglePublish(a)}
                className="rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium text-body hover:bg-canvas"
              >
                {a.is_published ? "非公開にする" : "公開する"}
              </button>
              <button
                onClick={() => remove(a)}
                className="rounded-md border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-soft"
              >
                削除
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
