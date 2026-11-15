"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestJson } from "@/lib/api/request";
import {
  NEXT_STATUS,
  STATUS_REASON_MAX_LENGTH,
  TOURNAMENT_STATUS_LABEL,
  canTransition,
} from "@/lib/tournament/status";
import type { TournamentStatus } from "@/types/database";

type ReasonAction = "correct" | "cancel";

export function StatusControl({
  tournamentId,
  currentStatus,
}: {
  tournamentId: string;
  currentStatus: TournamentStatus;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
  const [reason, setReason] = useState("");

  const next = NEXT_STATUS[currentStatus];
  // 公開後の訂正(結果公開 → 開催中に戻す)と、中止
  const canCorrect = canTransition(currentStatus, "RUNNING") && currentStatus === "PUBLISHED";
  const canCancel = canTransition(currentStatus, "CANCELLED");

  async function change(status: TournamentStatus, withReason?: string) {
    setPending(true);
    setError(null);
    const r = await requestJson(`/api/tournaments/${tournamentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withReason ? { status, reason: withReason } : { status }),
    });
    setPending(false);
    if (!r.ok) {
      setError(r.message);
      return false;
    }
    setReasonAction(null);
    setReason("");
    router.refresh();
    return true;
  }

  async function submitReason() {
    if (!reasonAction) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("理由を入力してください");
      return;
    }
    if (
      reasonAction === "cancel" &&
      !window.confirm("大会を中止します。この操作は元に戻せません。よろしいですか?")
    ) {
      return;
    }
    await change(reasonAction === "cancel" ? "CANCELLED" : "RUNNING", trimmed);
  }

  return (
    <div>
      <p className="mb-3 text-sm text-slate-600">
        現在: {TOURNAMENT_STATUS_LABEL[currentStatus]}
      </p>

      {currentStatus === "CANCELLED" && (
        <p className="text-sm text-slate-500">この大会は中止されました。状態は変更できません。</p>
      )}

      {next && (
        <button
          onClick={() => change(next)}
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          {pending && !reasonAction ? "更新中..." : `${TOURNAMENT_STATUS_LABEL[next]} に進める`}
        </button>
      )}

      {(canCorrect || canCancel) && !reasonAction && (
        <div className="mt-3 flex flex-wrap gap-2">
          {canCorrect && (
            <button
              onClick={() => {
                setError(null);
                setReasonAction("correct");
              }}
              disabled={pending}
              className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-60"
            >
              訂正のため開催中に戻す
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => {
                setError(null);
                setReasonAction("cancel");
              }}
              disabled={pending}
              className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
            >
              大会を中止する
            </button>
          )}
        </div>
      )}

      {reasonAction && (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <label className="mb-1 block text-xs font-medium text-slate-700">
            {reasonAction === "cancel"
              ? "中止の理由(監査ログに記録されます)"
              : "訂正の理由(監査ログに記録されます。公開中の結果は一旦非公開になります)"}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={STATUS_REASON_MAX_LENGTH}
            rows={2}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={submitReason}
              disabled={pending}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-60 ${
                reasonAction === "cancel"
                  ? "bg-red-600 hover:bg-red-500"
                  : "bg-amber-600 hover:bg-amber-500"
              }`}
            >
              {pending ? "更新中..." : reasonAction === "cancel" ? "中止する" : "開催中に戻す"}
            </button>
            <button
              onClick={() => {
                setReasonAction(null);
                setReason("");
                setError(null);
              }}
              disabled={pending}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-white disabled:opacity-60"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
