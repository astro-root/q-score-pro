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
    "rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5"
      >
        <h2 className="text-sm font-semibold text-slate-700">お知らせを投稿</h2>
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
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {pending ? "投稿中..." : "投稿"}
        </button>
      </form>

      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {initialAnnouncements.length === 0 && (
          <li className="p-6 text-center text-sm text-slate-400">まだお知らせはありません</li>
        )}
        {initialAnnouncements.map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-4 px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-slate-900">{a.title}</p>
                {!a.is_published && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    非公開
                  </span>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.body}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => togglePublish(a)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {a.is_published ? "非公開にする" : "公開する"}
              </button>
              <button
                onClick={() => remove(a)}
                className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
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
