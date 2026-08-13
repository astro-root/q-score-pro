"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Database } from "@/types/database";
import type { RuleConfig } from "@/lib/rules/types";
import { RuleConfigEditor } from "../rule-config-editor";

type Round = Database["public"]["Tables"]["rounds"]["Row"];
type Participant = Database["public"]["Tables"]["participants"]["Row"];
type RoundParticipant = Database["public"]["Tables"]["round_participants"]["Row"] & {
  participants: Pick<Participant, "id" | "display_name" | "affiliation" | "status"> | null;
};

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "未開始",
  RUNNING: "進行中",
  PAUSED: "一時停止",
  FINISHED: "終了",
};

const NEXT_STATUS: Record<string, string | null> = {
  NOT_STARTED: "RUNNING",
  RUNNING: "FINISHED",
  PAUSED: "RUNNING",
  FINISHED: null,
};

export function RoundDetail({
  tournamentId,
  round,
  initialRoundParticipants,
  allParticipants,
  canManageRounds,
  canGradePaperQuiz,
  canOperateScore,
}: {
  tournamentId: string;
  round: Round;
  initialRoundParticipants: RoundParticipant[];
  allParticipants: Participant[];
  canManageRounds: boolean;
  canGradePaperQuiz: boolean;
  canOperateScore: boolean;
}) {
  const router = useRouter();
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>(
    Object.fromEntries(
      initialRoundParticipants.map((rp) => [rp.participant_id, rp.score === null ? "" : String(rp.score)])
    )
  );
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [groupCount, setGroupCount] = useState("4");
  const [groupMethod, setGroupMethod] = useState<"SNAKE" | "ROUND_ROBIN" | "SEQUENTIAL_BLOCKS">("SNAKE");
  const [ruleConfig, setRuleConfig] = useState<RuleConfig>(round.rule_config);
  const [ruleMessage, setRuleMessage] = useState<string | null>(null);

  const attachedIds = new Set(initialRoundParticipants.map((rp) => rp.participant_id));
  const unattached = allParticipants.filter((p) => !attachedIds.has(p.id));

  const sorted = useMemo(
    () =>
      [...initialRoundParticipants].sort((a, b) => {
        if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
        if (a.rank !== null) return -1;
        if (b.rank !== null) return 1;
        return (a.participants?.display_name ?? "").localeCompare(b.participants?.display_name ?? "");
      }),
    [initialRoundParticipants]
  );

  async function advanceStatus() {
    const next = NEXT_STATUS[round.status];
    if (!next) return;
    setPending("status");
    await fetch(`/api/tournaments/${tournamentId}/rounds/${round.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setPending(null);
    router.refresh();
  }

  async function addParticipants(ids: string[]) {
    if (ids.length === 0) return;
    setPending("add");
    await fetch(`/api/tournaments/${tournamentId}/rounds/${round.id}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantIds: ids }),
    });
    setPending(null);
    router.refresh();
  }

  async function saveScores() {
    setPending("scores");
    setMessage(null);
    const scores = Object.entries(scoreDrafts)
      .filter(([, v]) => v !== "")
      .map(([participantId, v]) => ({ participantId, score: Number(v) }));

    const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${round.id}/scores`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scores }),
    });
    setPending(null);
    if (!res.ok) {
      setMessage("得点の保存に失敗しました");
      return;
    }
    setMessage("得点を保存し、順位・通過を再計算しました");
    router.refresh();
  }

  async function runAutoGrouping() {
    setPending("groups");
    setMessage(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${round.id}/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupCount: Number(groupCount), method: groupMethod }),
    });
    setPending(null);
    if (!res.ok) {
      setMessage("組分けに失敗しました");
      return;
    }
    setMessage("組分けを実行しました(手動で個別修正も可能です)");
    router.refresh();
  }

  async function saveRuleConfig() {
    setPending("rules");
    setRuleMessage(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${round.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ruleConfig }),
    });
    setPending(null);
    if (!res.ok) {
      setRuleMessage("保存に失敗しました");
      return;
    }
    setRuleMessage("保存しました");
    router.refresh();
  }

  const inputClass =
    "rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  return (
    <div className="flex flex-col gap-6">
      <section className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-5">
        <div>
          <p className="text-sm text-slate-500">ステータス</p>
          <p className="font-medium text-slate-900">{STATUS_LABEL[round.status]}</p>
        </div>
        <div className="flex gap-2">
          {canOperateScore && round.round_type === "BUZZER" && (
            <Link
              href={`/tournaments/${tournamentId}/rounds/${round.id}/operate`}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              得点操作画面を開く
            </Link>
          )}
          {canManageRounds && NEXT_STATUS[round.status] && (
            <button
              onClick={advanceStatus}
              disabled={pending === "status"}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {STATUS_LABEL[NEXT_STATUS[round.status]!]} にする
            </button>
          )}
        </div>
      </section>

      {canManageRounds && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">得点ルール</h2>
          <RuleConfigEditor value={ruleConfig} onChange={setRuleConfig} />
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={saveRuleConfig}
              disabled={pending === "rules"}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {pending === "rules" ? "保存中..." : "ルールを保存"}
            </button>
            {ruleMessage && <p className="text-sm text-emerald-600">{ruleMessage}</p>}
          </div>
        </section>
      )}

      {canManageRounds && unattached.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            このラウンドに参加者を追加 ({unattached.length}名未追加)
          </h2>
          <button
            onClick={() => addParticipants(unattached.map((p) => p.id))}
            disabled={pending === "add"}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {pending === "add" ? "追加中..." : "全員をこのラウンドに追加"}
          </button>
        </section>
      )}

      {canManageRounds && round.round_type === "PAPER" && sorted.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">自動組分け</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-600">組数</label>
              <input
                type="number"
                min={1}
                max={26}
                value={groupCount}
                onChange={(e) => setGroupCount(e.target.value)}
                className={`${inputClass} w-20`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-600">方式</label>
              <select
                value={groupMethod}
                onChange={(e) => setGroupMethod(e.target.value as typeof groupMethod)}
                className={inputClass}
              >
                <option value="SNAKE">上位から均等配分(スネーク)</option>
                <option value="ROUND_ROBIN">人数均等(順番割り当て)</option>
                <option value="SEQUENTIAL_BLOCKS">上位グループ丸ごと(ブロック)</option>
              </select>
            </div>
            <button
              onClick={runAutoGrouping}
              disabled={pending === "groups"}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {pending === "groups" ? "実行中..." : "自動組分けを実行"}
            </button>
          </div>
        </section>
      )}

      <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">順位</th>
              <th className="px-4 py-3">氏名</th>
              <th className="px-4 py-3">組</th>
              <th className="px-4 py-3">得点</th>
              <th className="px-4 py-3">通過</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  まだ参加者がいません
                </td>
              </tr>
            )}
            {sorted.map((rp) => (
              <tr key={rp.id}>
                <td className="px-4 py-3 text-slate-600">{rp.rank ?? "-"}</td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {rp.participants?.display_name ?? "-"}
                </td>
                <td className="px-4 py-3 text-slate-600">{rp.group_label ?? "-"}</td>
                <td className="px-4 py-3">
                  {canGradePaperQuiz ? (
                    <input
                      type="number"
                      value={scoreDrafts[rp.participant_id] ?? ""}
                      onChange={(e) =>
                        setScoreDrafts((prev) => ({ ...prev, [rp.participant_id]: e.target.value }))
                      }
                      className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                    />
                  ) : (
                    (rp.score ?? "-")
                  )}
                </td>
                <td className="px-4 py-3">
                  {rp.passed === true && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                      通過
                    </span>
                  )}
                  {rp.passed === false && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      非通過
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {canGradePaperQuiz && sorted.length > 0 && (
        <div className="flex items-center gap-3">
          <button
            onClick={saveScores}
            disabled={pending === "scores"}
            className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {pending === "scores" ? "保存中..." : "得点を保存して順位を再計算"}
          </button>
          {message && <p className="text-sm text-emerald-600">{message}</p>}
        </div>
      )}
    </div>
  );
}
