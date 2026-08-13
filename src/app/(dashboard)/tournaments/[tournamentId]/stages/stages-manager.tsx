"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Database } from "@/types/database";

type Stage = Database["public"]["Tables"]["stages"]["Row"];
type Round = Database["public"]["Tables"]["rounds"]["Row"];

export function StagesManager({
  tournamentId,
  initialStages,
  rounds,
}: {
  tournamentId: string;
  initialStages: Stage[];
  rounds: Round[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    await fetch(`/api/tournaments/${tournamentId}/stages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setPending(false);
    setName("");
    router.refresh();
  }

  async function remove(stage: Stage) {
    if (!confirm(`「${stage.name}」を削除しますか?(所属するラウンドはステージ未設定になります)`)) return;
    await fetch(`/api/tournaments/${tournamentId}/stages/${stage.id}`, { method: "DELETE" });
    router.refresh();
  }

  const roundsByStage = new Map<string | null, Round[]>();
  for (const r of rounds) {
    const key = r.stage_id;
    roundsByStage.set(key, [...(roundsByStage.get(key) ?? []), r]);
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-slate-500">
        予選・敗者復活・本戦・準決勝・決勝のように、大会を自由な構成のステージに分けて整理できます。
        ラウンドをどのステージに所属させるかはラウンド作成・編集時に設定します。
      </p>

      <form
        onSubmit={handleCreate}
        className="flex items-end gap-3 rounded-lg border border-slate-200 bg-white p-5"
      >
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">ステージ名</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="例: 予選"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          追加
        </button>
      </form>

      <div className="flex flex-col gap-4">
        {initialStages.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
            まだステージがありません
          </div>
        )}
        {initialStages.map((stage) => (
          <div key={stage.id} className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-medium text-slate-900">{stage.name}</h3>
              <button
                onClick={() => remove(stage)}
                className="rounded-md border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                削除
              </button>
            </div>
            <ul className="text-sm text-slate-600">
              {(roundsByStage.get(stage.id) ?? []).length === 0 && (
                <li className="text-slate-400">このステージのラウンドはまだありません</li>
              )}
              {(roundsByStage.get(stage.id) ?? []).map((r) => (
                <li key={r.id}>・{r.name}</li>
              ))}
            </ul>
          </div>
        ))}
        {(roundsByStage.get(null) ?? []).length > 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5">
            <h3 className="mb-2 text-sm font-medium text-slate-500">ステージ未設定のラウンド</h3>
            <ul className="text-sm text-slate-600">
              {(roundsByStage.get(null) ?? []).map((r) => (
                <li key={r.id}>・{r.name}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
