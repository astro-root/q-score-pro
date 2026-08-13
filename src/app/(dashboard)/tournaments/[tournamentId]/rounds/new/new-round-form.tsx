"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Database } from "@/types/database";
import { DEFAULT_RULE_CONFIG, type RuleConfig } from "@/lib/rules/types";
import { RuleConfigEditor } from "../rule-config-editor";

type Stage = Database["public"]["Tables"]["stages"]["Row"];

export function NewRoundForm({ tournamentId, stages }: { tournamentId: string; stages: Stage[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [roundType, setRoundType] = useState<"PAPER" | "BUZZER">("PAPER");
  const [stageId, setStageId] = useState("");
  const [advanceCount, setAdvanceCount] = useState("");
  const [ruleConfig, setRuleConfig] = useState<RuleConfig>(DEFAULT_RULE_CONFIG);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const res = await fetch(`/api/tournaments/${tournamentId}/rounds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        roundType,
        stageId: stageId || undefined,
        advanceCount: advanceCount ? Number(advanceCount) : undefined,
        ruleConfig,
      }),
    });

    setPending(false);

    if (!res.ok) {
      setError("作成に失敗しました");
      return;
    }

    const body = await res.json();
    router.push(`/tournaments/${tournamentId}/rounds/${body.round.id}`);
    router.refresh();
  }

  const inputClass =
    "rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-700">ラウンド名</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="例: 予選"
          className={inputClass}
        />
      </div>

      {stages.length > 0 && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">ステージ(任意)</label>
          <select value={stageId} onChange={(e) => setStageId(e.target.value)} className={inputClass}>
            <option value="">未設定</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-700">形式</label>
        <select
          value={roundType}
          onChange={(e) => setRoundType(e.target.value as "PAPER" | "BUZZER")}
          className={inputClass}
        >
          <option value="PAPER">ペーパークイズ</option>
          <option value="BUZZER">早押しクイズ(得点操作画面はPhase 5で実装予定)</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-700">通過人数(任意)</label>
        <input
          type="number"
          min={1}
          value={advanceCount}
          onChange={(e) => setAdvanceCount(e.target.value)}
          className={inputClass}
        />
        <p className="text-xs text-slate-400">
          同着の場合は境界順位の参加者を全員通過扱いにします(足切りの公平性を優先)。
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">得点ルール</h3>
        <RuleConfigEditor value={ruleConfig} onChange={setRuleConfig} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
      >
        {pending ? "作成中..." : "作成"}
      </button>
    </form>
  );
}
