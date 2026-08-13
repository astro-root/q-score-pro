"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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

  const recordEvent = useCallback(
    async (participantId: string, type: string, value?: number) => {
      setBusy(true);
      await fetch(`/api/tournaments/${tournamentId}/rounds/${roundId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId, type, value }),
      });
      setBusy(false);
      setFlash(`${type} を記録しました`);
      window.setTimeout(() => setFlash(null), 1200);
    },
    [tournamentId, roundId]
  );

  const undo = useCallback(async () => {
    setBusy(true);
    await fetch(`/api/tournaments/${tournamentId}/rounds/${roundId}/events/undo`, {
      method: "POST",
    });
    setBusy(false);
    setFlash("直前の操作を取り消しました");
    window.setTimeout(() => setFlash(null), 1200);
  }, [tournamentId, roundId]);

  const moveQuestion = useCallback(
    async (direction: "NEXT" | "PREV") => {
      await fetch(`/api/tournaments/${tournamentId}/rounds/${roundId}/question`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
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
        undo();
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
      if (!selectedId) return;
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
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => moveQuestion("PREV")}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
          >
            ← 前問題
          </button>
          <span className="text-lg font-bold">第 {questionNumber} 問</span>
          <button
            onClick={() => moveQuestion("NEXT")}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
          >
            次問題 →
          </button>
        </div>
        <div className="flex items-center gap-3">
          {flash && <span className="text-sm text-emerald-400">{flash}</span>}
          <button
            onClick={undo}
            disabled={busy}
            className="rounded-md border border-amber-600 px-3 py-1.5 text-sm text-amber-400 hover:bg-amber-950 disabled:opacity-50"
          >
            Undo (Ctrl+Z)
          </button>
          <button
            onClick={() => setShowShortcuts((v) => !v)}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
          >
            ? ショートカット
          </button>
        </div>
      </header>

      {showShortcuts && (
        <div className="border-b border-slate-800 bg-slate-900 px-6 py-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-3">
            {SHORTCUTS.map((s) => (
              <div key={s.keys} className="flex justify-between gap-4">
                <span className="font-mono text-indigo-400">{s.keys}</span>
                <span className="text-slate-400">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {participants.map((rp, index) => {
            const selected = selectedId === rp.participant_id;
            return (
              <button
                key={rp.id}
                onClick={() => setSelectedId(rp.participant_id)}
                className={`flex flex-col gap-3 rounded-xl border p-4 text-left transition ${
                  selected
                    ? "border-indigo-400 bg-indigo-950/60 ring-2 ring-indigo-400"
                    : "border-slate-800 bg-slate-900"
                } ${rp.disqualified ? "opacity-50" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                    {index + 1}
                  </span>
                  {rp.disqualified && (
                    <span className="rounded-full bg-red-900 px-2 py-0.5 text-xs text-red-300">失格</span>
                  )}
                  {rp.won && (
                    <span className="rounded-full bg-emerald-900 px-2 py-0.5 text-xs text-emerald-300">
                      勝ち抜け
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-lg font-bold">{rp.participants?.display_name ?? "-"}</p>
                  <p className="text-3xl font-mono font-bold text-indigo-300">{rp.score ?? 0}</p>
                  <p className="text-xs text-slate-500">
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
                    className="flex-1 rounded-md bg-emerald-700 py-2 text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50"
                  >
                    正解
                  </button>
                  <button
                    onClick={() => recordEvent(rp.participant_id, "WRONG")}
                    disabled={busy}
                    className="flex-1 rounded-md bg-red-700 py-2 text-sm font-semibold hover:bg-red-600 disabled:opacity-50"
                  >
                    誤答
                  </button>
                  <button
                    onClick={() => recordEvent(rp.participant_id, "THROUGH")}
                    disabled={busy}
                    className="flex-1 rounded-md bg-slate-700 py-2 text-sm font-semibold hover:bg-slate-600 disabled:opacity-50"
                  >
                    スルー
                  </button>
                </div>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => recordEvent(rp.participant_id, "MANUAL_ADJUST", 1)}
                    disabled={busy}
                    className="flex-1 rounded-md border border-slate-700 py-1.5 text-xs hover:bg-slate-800 disabled:opacity-50"
                  >
                    +1 加点
                  </button>
                  <button
                    onClick={() => recordEvent(rp.participant_id, "MANUAL_ADJUST", -1)}
                    disabled={busy}
                    className="flex-1 rounded-md border border-slate-700 py-1.5 text-xs hover:bg-slate-800 disabled:opacity-50"
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
                    className="flex-1 rounded-md border border-red-800 py-1.5 text-xs text-red-300 hover:bg-red-950 disabled:opacity-50"
                  >
                    {rp.disqualified ? "復活" : "失格"}
                  </button>
                </div>
              </button>
            );
          })}
        </div>
        {participants.length === 0 && (
          <p className="mt-12 text-center text-slate-500">
            このラウンドに参加者が追加されていません。ラウンド詳細画面から追加してください。
          </p>
        )}
      </main>
    </div>
  );
}
