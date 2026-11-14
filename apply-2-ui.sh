#!/usr/bin/env bash
set -euo pipefail
[ -f package.json ] && [ -d src ] || { echo "エラー: リポジトリのルートで実行してください" >&2; exit 1; }

echo "write: src/app/(dashboard)/tournaments/[tournamentId]/rounds/[roundId]/operate/operator-screen.tsx"
mkdir -p "$(dirname 'src/app/(dashboard)/tournaments/[tournamentId]/rounds/[roundId]/operate/operator-screen.tsx')"
cat > 'src/app/(dashboard)/tournaments/[tournamentId]/rounds/[roundId]/operate/operator-screen.tsx' <<'QSCORE_EOF'
"use client";

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

      {errorMessage && (
        <div
          role="alert"
          className="flex items-start justify-between gap-4 border-b border-red-800 bg-red-950 px-6 py-3 text-sm text-red-200"
        >
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="shrink-0 rounded border border-red-700 px-2 py-0.5 text-xs hover:bg-red-900"
          >
            閉じる
          </button>
        </div>
      )}

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
QSCORE_EOF

echo "write: next.config.ts"
mkdir -p "$(dirname 'next.config.ts')"
cat > 'next.config.ts' <<'QSCORE_EOF'
import type { NextConfig } from "next";

/**
 * セキュリティヘッダー (R-09 / Issue 13)。
 *
 * - X-Frame-Options: DENY ... 管理画面をクリックジャッキングから守る。
 *   ただし /obs/* は除外する(配信ツールや他サイトへの埋め込みを妨げないため。
 *   OBS Browser Source 自体は iframe ではないので DENY でも動くが、
 *   表示画面は公開前提のため埋め込みを許可しておく)。
 * - X-Content-Type-Options: nosniff ... MIMEスニッフィング対策。
 * - Referrer-Policy ... 他サイトへ遷移する際にURL全体(大会IDなど)を渡さない。
 * - Permissions-Policy ... 使わないブラウザ機能を無効化。
 *
 * CSP(Content-Security-Policy)は、Next.js のインラインスクリプトに nonce を
 * 発行する設計とセットで導入する必要があり、誤ると画面全体が動かなくなるため
 * このコミットでは入れていない(別途対応)。HSTS はホスティング側で設定する想定。
 */
const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: baseSecurityHeaders,
      },
      {
        // /obs/ で始まるパス以外すべて
        source: "/((?!obs/).*)",
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      },
    ];
  },
};

export default nextConfig;
QSCORE_EOF

echo "Part 2 完了"
