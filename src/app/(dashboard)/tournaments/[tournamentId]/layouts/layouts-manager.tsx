"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface LayoutSummary {
  id: string;
  name: string;
  updated_at: string;
}

interface RoundOption {
  id: string;
  name: string;
}

export function LayoutsManager({
  tournamentId,
  initialLayouts,
  rounds,
}: {
  tournamentId: string;
  initialLayouts: LayoutSummary[];
  rounds: RoundOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [obsRoundByLayout, setObsRoundByLayout] = useState<Record<string, string>>({});
  const [copiedLayoutId, setCopiedLayoutId] = useState<string | null>(null);

  async function create(duplicateFromId?: string) {
    if (!name && !duplicateFromId) return;
    setPending(true);
    const res = await fetch(`/api/tournaments/${tournamentId}/layouts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name || `複製 (${new Date().toLocaleTimeString("ja-JP")})`,
        duplicateFromId,
      }),
    });
    setPending(false);
    if (!res.ok) return;
    const body = await res.json();
    router.push(`/tournaments/${tournamentId}/layouts/${body.layout.id}`);
  }

  async function remove(layoutId: string, layoutName: string) {
    if (!confirm(`「${layoutName}」を削除しますか?`)) return;
    await fetch(`/api/tournaments/${tournamentId}/layouts/${layoutId}`, { method: "DELETE" });
    router.refresh();
  }

  function obsUrl(layoutId: string) {
    const roundId = obsRoundByLayout[layoutId];
    if (!roundId || typeof window === "undefined") return null;
    return `${window.location.origin}/obs/${layoutId}?round=${roundId}`;
  }

  async function copyObsUrl(layoutId: string) {
    const url = obsUrl(layoutId);
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopiedLayoutId(layoutId);
    window.setTimeout(() => setCopiedLayoutId(null), 1500);
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
        className="flex items-end gap-3 rounded-lg border border-slate-200 bg-white p-5"
      >
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">新しいレイアウト名</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: Main / Scoreboard / Final / OBS"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <button
          type="submit"
          disabled={pending || !name}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          作成
        </button>
      </form>

      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {initialLayouts.length === 0 && (
          <li className="p-8 text-center text-sm text-slate-400">まだレイアウトがありません</li>
        )}
        {initialLayouts.map((layout) => (
          <li key={layout.id} className="flex flex-col gap-3 px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <Link
                  href={`/tournaments/${tournamentId}/layouts/${layout.id}`}
                  className="font-medium text-indigo-600 hover:underline"
                >
                  {layout.name}
                </Link>
                <p className="text-xs text-slate-400">
                  最終更新: {new Date(layout.updated_at).toLocaleString("ja-JP")}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => create(layout.id)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  複製
                </button>
                <button
                  onClick={() => remove(layout.id, layout.name)}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                >
                  削除
                </button>
              </div>
            </div>

            {rounds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-3">
                <span className="text-xs text-slate-500">OBS Browser Source用URL:</span>
                <select
                  value={obsRoundByLayout[layout.id] ?? ""}
                  onChange={(e) =>
                    setObsRoundByLayout((prev) => ({ ...prev, [layout.id]: e.target.value }))
                  }
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                >
                  <option value="">ラウンドを選択</option>
                  {rounds.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => copyObsUrl(layout.id)}
                  disabled={!obsRoundByLayout[layout.id]}
                  className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-white disabled:opacity-50"
                >
                  {copiedLayoutId === layout.id ? "コピーしました" : "URLをコピー"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
