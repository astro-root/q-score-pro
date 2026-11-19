"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { requestJson } from "@/lib/api/request";
import type { Database } from "@/types/database";

type RoundParticipantRow = Database["public"]["Tables"]["round_participants"]["Row"] & {
  participants: { id: string; display_name: string } | null;
};

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "1-9", label: "参加者を選択" },
  { keys: "C", label: "選択中の参加者を正解にする" },
  { keys: "X", label: "選択中の参加者を誤答にする" },
  { keys: "T", label: "選択中の参加者をスルーにする" },
  { keys: "D", label: "選択中の参加者を失格にする" },
  { keys: "→ / N", label: "次の問題へ" },
  { keys: "← / P", label: "前の問題へ" },
  { keys: "Ctrl/Cmd + Z", label: "直前の操作を取り消す(Undo)" },
  { keys: "Esc", label: "選択解除" },
  { keys: "?", label: "このショートカット一覧の表示切り替え" },
];

export function OperatorScreen({
  tournamentId,
  roundId,
  initialParticipants,
  initialQuestionNumber,
}: {
  tournamentId: string;
  roundId: string;
  initialParticipants: RoundParticipantRow[];
  initialQuestionNumber: number;
}) {
  const [participants, setParticipants] = useState(initialParticipants);
  const [questionNumber, setQuestionNumber] = useState(initialQuestionNumber);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  // Failures must be visible: a silent failure during a live round is worse
  // than a wrong click (R-02). Stays on screen until dismissed or until the
  // next action succeeds, so it can't be missed while the operator is busy.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const supabaseRef = useRef(createClient());

  const refetchParticipants = useCallback(async () => {
    const { data } = await supabaseRef.current
      .from("round_participants")
      .select("*, participants ( id, display_name )")
      .eq("round_id", roundId);
    if (data) {
      setParticipants(
        [...data].sort((a, b) =>
          (a.participants?.display_name ?? "").localeCompare(b.participants?.display_name ?? "")
        )
      );
    }
  }, [roundId]);

  // Realtime sync: any staff member's action (this screen or another
  // operator's) updates every connected operator screen live (master spec
  // section 10: 複数人同時操作).
  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`round-participants-${roundId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "round_participants", filter: `round_id=eq.${roundId}` },
        () => refetchParticipants()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rounds", filter: `id=eq.${roundId}` },
        (payload) => {
          const row = payload.new as { current_question_number?: number };
          if (typeof row.current_question_number === "number") {
            setQuestionNumber(row.current_question_number);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roundId, refetchParticipants]);

  const showFlash = useCallback((message: string) => {
    setFlash(message);
    window.setTimeout(() => setFlash(null), 1200);
  }, []);

  const recordEvent = useCallback(
    async (participantId: string, type: string, value?: number) => {
      setBusy(true);
      try {
        const result = await requestJson(
          `/api/tournaments/${tournamentId}/rounds/${roundId}/events`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ participantId, type, value }),
          }
        );
        if (!result.ok) {
          setErrorMessage(`${type} を記録できませんでした: ${result.message}`);
        } else {
          setErrorMessage(null);
          showFlash(`${type} を記録しました`);
        }
        // Don't depend on Realtime alone for the operator's own action.
        await refetchParticipants();
      } finally {
        setBusy(false);
      }
    },
    [tournamentId, roundId, refetchParticipants, showFlash]
  );

  const undo = useCallback(async () => {
    setBusy(true);
    try {
      const result = await requestJson(
        `/api/tournaments/${tournamentId}/rounds/${roundId}/events/undo`,
        { method: "POST" }
      );
      if (!result.ok) {
        setErrorMessage(`取り消せませんでした: ${result.message}`);
      } else {
        setErrorMessage(null);
        showFlash("直前の操作を取り消しました");
      }
      await refetchParticipants();
    } finally {
      setBusy(false);
    }
  }, [tournamentId, roundId, refetchParticipants, showFlash]);

  const moveQuestion = useCallback(
    async (direction: "NEXT" | "PREV") => {
      const result = await requestJson<{ currentQuestionNumber: number }>(
        `/api/tournaments/${tournamentId}/rounds/${roundId}/question`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ direction }),
        }
      );
      if (!result.ok) {
        setErrorMessage(`問題を移動できませんでした: ${result.message}`);
        return;
      }
      setErrorMessage(null);
      // Show the server's authoritative number immediately; Realtime then
      // keeps other operators' screens in sync.
      setQuestionNumber(result.data.currentQuestionNumber);
    },
    [tournamentId, roundId]
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "?") {
        setShowShortcuts((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        // A held-down key must not fire repeated undos / score events.
        if (!e.repeat) undo();
        return;
      }
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "n") {
        moveQuestion("NEXT");
        return;
      }
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "p") {
        moveQuestion("PREV");
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        const index = Number(e.key) - 1;
        const target = participants[index];
        if (target) setSelectedId(target.participant_id);
        return;
      }
      if (!selectedId || e.repeat) return;
      const key = e.key.toLowerCase();
      if (key === "c") recordEvent(selectedId, "CORRECT");
      else if (key === "x") recordEvent(selectedId, "WRONG");
      else if (key === "t") recordEvent(selectedId, "THROUGH");
      else if (key === "d") recordEvent(selectedId, "DISQUALIFY");
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, participants, recordEvent, undo, moveQuestion]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-canvas text-ink">
      <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-4">
        <div className="flex items-center gap-4">
          <Link
            href={`/tournaments/${tournamentId}/rounds/${roundId}`}
            className="text-sm font-medium text-muted hover:text-ink"
          >
            ← ラウンドへ戻る
          </Link>
          <button
            onClick={() => moveQuestion("PREV")}
            className="rounded-md border border-border-strong px-3 py-1.5 text-sm hover:bg-surface-muted"
          >
            ← 前問題
          </button>
          <span className="text-lg font-bold">第 {questionNumber} 問</span>
          <button
            onClick={() => moveQuestion("NEXT")}
            className="rounded-md border border-border-strong px-3 py-1.5 text-sm hover:bg-surface-muted"
          >
            次問題 →
          </button>
        </div>
        <div className="flex items-center gap-3">
          {flash && <span className="text-sm font-medium text-success">{flash}</span>}
          <button
            onClick={undo}
            disabled={busy}
            className="rounded-md border border-warning/50 px-3 py-1.5 text-sm font-medium text-warning hover:bg-warning-soft disabled:opacity-50"
          >
            Undo (Ctrl+Z)
          </button>
          <button
            onClick={() => setShowShortcuts((v) => !v)}
            className="rounded-md border border-border-strong px-3 py-1.5 text-sm hover:bg-surface-muted"
          >
            ? ショートカット
          </button>
        </div>
      </header>

      {errorMessage && (
        <div
          role="alert"
          className="flex items-start justify-between gap-4 border-b border-danger/30 bg-danger-soft px-6 py-3 text-sm text-danger"
        >
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="shrink-0 rounded border border-danger/40 px-2 py-0.5 text-xs hover:bg-danger/10"
          >
            閉じる
          </button>
        </div>
      )}

      {showShortcuts && (
        <div className="border-b border-border bg-surface-muted px-6 py-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-3">
            {SHORTCUTS.map((s) => (
              <div key={s.keys} className="flex justify-between gap-4">
                <span className="font-mono font-semibold text-primary">{s.keys}</span>
                <span className="text-muted">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {participants.map((rp, index) => {
            const selected = selectedId === rp.participant_id;
            return (
              <button
                key={rp.id}
                onClick={() => setSelectedId(rp.participant_id)}
                className={`flex flex-col gap-3 rounded-xl border p-4 text-left transition ${
                  selected
                    ? "border-primary bg-primary-soft ring-2 ring-primary"
                    : "border-border bg-surface shadow-card"
                } ${rp.disqualified ? "opacity-50" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="rounded bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted">
                    {index + 1}
                  </span>
                  {rp.disqualified && (
                    <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">失格</span>
                  )}
                  {rp.won && (
                    <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
                      勝ち抜け
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-lg font-bold">{rp.participants?.display_name ?? "-"}</p>
                  <p className="font-score text-3xl font-bold text-primary">{rp.score ?? 0}</p>
                  <p className="text-xs text-muted">
                    正解 {rp.correct_count} ・ 誤答 {rp.wrong_count} ・ スルー {rp.through_count}
                  </p>
                </div>
                <div
                  className="flex gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => recordEvent(rp.participant_id, "CORRECT")}
                    disabled={busy}
                    className="flex-1 rounded-md bg-success py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    正解
                  </button>
                  <button
                    onClick={() => recordEvent(rp.participant_id, "WRONG")}
                    disabled={busy}
                    className="flex-1 rounded-md bg-danger py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    誤答
                  </button>
                  <button
                    onClick={() => recordEvent(rp.participant_id, "THROUGH")}
                    disabled={busy}
                    className="flex-1 rounded-md border border-border-strong bg-surface-muted py-2 text-sm font-semibold text-body hover:bg-border disabled:opacity-50"
                  >
                    スルー
                  </button>
                </div>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => recordEvent(rp.participant_id, "MANUAL_ADJUST", 1)}
                    disabled={busy}
                    className="flex-1 rounded-md border border-border-strong py-1.5 text-xs hover:bg-surface-muted disabled:opacity-50"
                  >
                    +1 加点
                  </button>
                  <button
                    onClick={() => recordEvent(rp.participant_id, "MANUAL_ADJUST", -1)}
                    disabled={busy}
                    className="flex-1 rounded-md border border-border-strong py-1.5 text-xs hover:bg-surface-muted disabled:opacity-50"
                  >
                    -1 減点
                  </button>
                  <button
                    onClick={() =>
                      recordEvent(
                        rp.participant_id,
                        rp.disqualified ? "REINSTATE" : "DISQUALIFY"
                      )
                    }
                    disabled={busy}
                    className="flex-1 rounded-md border border-danger/40 py-1.5 text-xs text-danger hover:bg-danger-soft disabled:opacity-50"
                  >
                    {rp.disqualified ? "復活" : "失格"}
                  </button>
                </div>
              </button>
            );
          })}
        </div>
        {participants.length === 0 && (
          <p className="mt-12 text-center text-muted">
            このラウンドに参加者が追加されていません。ラウンド詳細画面から追加してください。
          </p>
        )}
      </main>
    </div>
  );
}
