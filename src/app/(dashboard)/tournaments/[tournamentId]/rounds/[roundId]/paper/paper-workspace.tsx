"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { requestJson } from "@/lib/api/request";
import type { PaperParticipantRow } from "@/lib/paper/csv-rows";
import { PLATE_PALETTE, plateTextColor } from "@/lib/paper/plates";
import {
  questionStats,
  rankParticipants,
  tallyParticipants,
  withFallbackScores,
  type PaperAnswer,
  type PaperQuestion,
  type RankedParticipant,
} from "@/lib/paper/scoring";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/Field";

type Tab = "grade" | "ranking" | "stats" | "questions" | "plates";
type Cell = boolean | undefined;

const key = (pid: string, qid: string) => `${pid}\u0000${qid}`;
const fmt = (n: number | null) => (n === null ? "-" : Number.isInteger(n) ? String(n) : n.toFixed(1));
const pct = (r: number | null) => (r === null ? "-" : `${Math.round(r * 1000) / 10}%`);

export function PaperWorkspace(props: {
  tournamentId: string;
  roundId: string;
  advanceCount: number | null;
  canManageQuestions: boolean;
  canGrade: boolean;
  canExport: boolean;
  participants: PaperParticipantRow[];
  savedRanked: RankedParticipant[];
  questions: PaperQuestion[];
  savedAnswers: PaperAnswer[];
}) {
  const { tournamentId, roundId, advanceCount, canManageQuestions, canGrade, canExport } = props;
  const router = useRouter();
  const base = `/api/tournaments/${tournamentId}/rounds/${roundId}/paper`;

  const [tab, setTab] = useState<Tab>("grade");
  const [saved, setSaved] = useState<Map<string, boolean>>(() => toMap(props.savedAnswers));
  const [pending, setPending] = useState<Map<string, boolean | null>>(new Map());
  const [serverRanked, setServerRanked] = useState(props.savedRanked);
  const [plates, setPlates] = useState<Map<string, string | null>>(
    () => new Map(props.participants.map((p) => [p.participantId, p.plateColor]))
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  // router.refresh() 後(設問の保存など)に、サーバーの最新値へ state を合わせる。
  // useEffect で setState するとレンダーが連鎖するため、React 公式の
  // 「props が変わったら描画中に state を調整する」パターンを使う。
  // 未保存の変更があるときは上書きしない(設問の保存は未保存があると無効なので通常は起きない)。
  const [syncedFrom, setSyncedFrom] = useState({
    answers: props.savedAnswers,
    ranked: props.savedRanked,
    participants: props.participants,
  });
  if (
    pending.size === 0 &&
    (syncedFrom.answers !== props.savedAnswers ||
      syncedFrom.ranked !== props.savedRanked ||
      syncedFrom.participants !== props.participants)
  ) {
    setSyncedFrom({ answers: props.savedAnswers, ranked: props.savedRanked, participants: props.participants });
    setSaved(toMap(props.savedAnswers));
    setServerRanked(props.savedRanked);
    setPlates(new Map(props.participants.map((p) => [p.participantId, p.plateColor])));
  }

  // 未保存のまま閉じようとしたら止める
  useEffect(() => {
    if (pending.size === 0) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [pending.size]);

  const questions = useMemo(
    () => [...props.questions].sort((a, b) => a.number - b.number),
    [props.questions]
  );
  const participantIds = useMemo(() => props.participants.map((p) => p.participantId), [props.participants]);

  // 保存済み + 未保存の変更 を重ねた「いま画面にある正誤」
  const effective = useMemo(() => {
    const m = new Map(saved);
    for (const [k, v] of pending) {
      if (v === null) m.delete(k);
      else m.set(k, v);
    }
    return m;
  }, [saved, pending]);

  const effectiveAnswers = useMemo<PaperAnswer[]>(
    () =>
      [...effective].map(([k, isCorrect]) => {
        const [participantId, questionId] = k.split("\u0000");
        return { participantId, questionId, isCorrect };
      }),
    [effective]
  );

  // 仮の集計。保存前の見込みであり、確定値は保存後にサーバーから返る。
  // 回答がない参加者(手入力の点数だけを持つ人)は、保存済みの点数のまま順位に含める。
  const preview = useMemo(() => {
    const fallback = new Map(serverRanked.map((r) => [r.participantId, r.score]));
    return rankParticipants(
      withFallbackScores(tallyParticipants(participantIds, questions, effectiveAnswers), fallback),
      advanceCount
    );
  }, [participantIds, questions, effectiveAnswers, advanceCount, serverRanked]);
  // 未保存の変更がなければ DB の確定値をそのまま見せる(手入力の点数・順位・通過を含む)。
  const shown = pending.size > 0 ? preview : serverRanked;
  const shownById = useMemo(() => new Map(shown.map((r) => [r.participantId, r])), [shown]);
  const stats = useMemo(
    () => questionStats(participantIds, questions, effectiveAnswers),
    [participantIds, questions, effectiveAnswers]
  );

  const setCell = useCallback(
    (pid: string, qid: string, value: Cell) => {
      setPending((prev) => {
        const next = new Map(prev);
        const k = key(pid, qid);
        const savedValue = saved.get(k);
        const target: boolean | null = value === undefined ? null : value;
        if ((target === null && savedValue === undefined) || target === savedValue) next.delete(k);
        else next.set(k, target);
        return next;
      });
    },
    [saved]
  );

  async function saveAnswers() {
    if (pending.size === 0 || busy) return;
    setBusy(true);
    setMessage(null);
    const payload = [...pending].map(([k, isCorrect]) => {
      const [participantId, questionId] = k.split("\u0000");
      return { participantId, questionId, isCorrect };
    });
    const res = await requestJson<{ ranked: RankedParticipant[]; answers: PaperAnswer[] }>(`${base}/answers`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: payload }),
    });
    setBusy(false);
    if (!res.ok) {
      setMessage({ tone: "error", text: `保存できませんでした: ${res.message}(入力は残っています)` });
      return;
    }
    setSaved(toMap(res.data.answers));
    setServerRanked(res.data.ranked);
    setPending(new Map());
    setMessage({ tone: "success", text: `${payload.length}件を保存し、順位を更新しました` });
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-border">
        {(
          [
            ["grade", "採点入力"],
            ["ranking", "順位"],
            ["stats", "統計"],
            ["questions", "設問設定"],
            ["plates", "プレート色"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === id ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}

      {tab === "grade" && (
        <GradeGrid
          participants={props.participants}
          questions={questions}
          effective={effective}
          pending={pending}
          shownById={shownById}
          plates={plates}
          canGrade={canGrade}
          busy={busy}
          onSet={setCell}
          onSave={saveAnswers}
          onDiscard={() => setPending(new Map())}
        />
      )}
      {tab === "ranking" && (
        <RankingTable
          participants={props.participants}
          shownById={shownById}
          plates={plates}
          advanceCount={advanceCount}
          provisional={pending.size > 0}
          exportBase={canExport ? `${base}/export` : null}
        />
      )}
      {tab === "stats" && (
        <StatsTable stats={stats} provisional={pending.size > 0} exportHref={canExport ? `${base}/export?type=stats` : null} />
      )}
      {tab === "questions" && (
        <QuestionsEditor
          base={base}
          questions={questions}
          canManage={canManageQuestions}
          disabledReason={pending.size > 0 ? "未保存の採点があります。先に採点を保存してください" : null}
          onSaved={() => router.refresh()}
          setMessage={setMessage}
        />
      )}
      {tab === "plates" && (
        <PlatesEditor
          base={base}
          participants={props.participants}
          plates={plates}
          canGrade={canGrade}
          onApplied={(next) => setPlates(next)}
          setMessage={setMessage}
        />
      )}
    </div>
  );
}

function toMap(answers: PaperAnswer[]): Map<string, boolean> {
  return new Map(answers.map((a) => [key(a.participantId, a.questionId), a.isCorrect]));
}

function PlateChip({ color }: { color: string | null | undefined }) {
  if (!color) return <span className="inline-block h-3.5 w-3.5 rounded-full border border-dashed border-border-strong" aria-label="色なし" />;
  return (
    <span
      className="inline-block h-3.5 w-3.5 rounded-full border border-border-strong"
      style={{ backgroundColor: color, color: plateTextColor(color) }}
      aria-label={`プレート ${color}`}
    />
  );
}

/* ----------------------------- 採点入力 ----------------------------- */

function GradeGrid(props: {
  participants: PaperParticipantRow[];
  questions: PaperQuestion[];
  effective: Map<string, boolean>;
  pending: Map<string, boolean | null>;
  shownById: Map<string, RankedParticipant>;
  plates: Map<string, string | null>;
  canGrade: boolean;
  busy: boolean;
  onSet: (pid: string, qid: string, v: Cell) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const { participants, questions, effective, pending, shownById, plates, canGrade, busy, onSet } = props;
  const [filter, setFilter] = useState("");
  const refs = useRef(new Map<string, HTMLButtonElement>());

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q
      ? participants.filter((p) => `${p.displayName} ${p.affiliation ?? ""}`.toLowerCase().includes(q))
      : participants;
    return [...list].sort((a, b) => a.displayName.localeCompare(b.displayName, "ja"));
  }, [participants, filter]);

  if (questions.length === 0) {
    return (
      <EmptyNote>
        設問がまだありません。「設問設定」タブで問題数と配点を登録すると、問題ごとの採点ができます。
        <br />
        (設問を作らずに、ラウンド詳細で合計点だけを入力する従来の方法も引き続き使えます)
      </EmptyNote>
    );
  }
  if (participants.length === 0) {
    return <EmptyNote>このラウンドに参加者がいません。ラウンド詳細から参加者を追加してください。</EmptyNote>;
  }

  function move(pi: number, qi: number, dp: number, dq: number) {
    const np = Math.min(Math.max(pi + dp, 0), rows.length - 1);
    const nq = Math.min(Math.max(qi + dq, 0), questions.length - 1);
    refs.current.get(`${np}:${nq}`)?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent, pi: number, qi: number) {
    if (!canGrade) return;
    const pid = rows[pi].participantId;
    const qid = questions[qi].id;
    switch (e.key) {
      case "o":
      case "O":
      case "1":
        e.preventDefault();
        onSet(pid, qid, true);
        move(pi, qi, 0, 1);
        break;
      case "x":
      case "X":
      case "0":
        e.preventDefault();
        onSet(pid, qid, false);
        move(pi, qi, 0, 1);
        break;
      case "Backspace":
      case "Delete":
        e.preventDefault();
        onSet(pid, qid, undefined);
        break;
      case "ArrowRight":
        e.preventDefault();
        move(pi, qi, 0, 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        move(pi, qi, 0, -1);
        break;
      case "ArrowDown":
        e.preventDefault();
        move(pi, qi, 1, 0);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(pi, qi, -1, 0);
        break;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="名前・所属で絞り込み"
          aria-label="参加者を絞り込み"
          className="w-64 rounded-xl border border-border-strong bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex items-center gap-2">
          {pending.size > 0 && <Badge tone="warning">未保存 {pending.size}件</Badge>}
          {pending.size > 0 && (
            <Button variant="ghost" size="sm" onClick={props.onDiscard} disabled={busy}>
              変更を破棄
            </Button>
          )}
          {canGrade && (
            <Button onClick={props.onSave} disabled={busy || pending.size === 0}>
              {busy ? "保存中..." : "保存して順位を更新"}
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted">
        セルをクリックで ○ → × → 未採点 の順に切り替え。キー操作: <kbd>O</kbd>/<kbd>1</kbd>=○、<kbd>X</kbd>/<kbd>0</kbd>=×、
        <kbd>Backspace</kbd>=未採点、矢印キーで移動。
        {!canGrade && " (閲覧のみ: 採点の権限がありません)"}
      </p>

      <div className="max-h-[70vh] overflow-auto rounded-xl border border-border bg-surface">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 min-w-48 border-b border-r border-border bg-surface-muted px-3 py-2 text-left text-xs font-semibold text-muted">
                参加者
              </th>
              {questions.map((q) => (
                <th
                  key={q.id}
                  title={`配点 ${q.points}${q.label ? ` ・ ${q.label}` : ""}`}
                  className="sticky top-0 z-10 min-w-11 border-b border-border bg-surface-muted px-1 py-2 text-center text-xs font-semibold text-muted"
                >
                  Q{q.number}
                </th>
              ))}
              <th className="sticky top-0 z-10 border-b border-l border-border bg-surface-muted px-3 py-2 text-right text-xs font-semibold text-muted">
                得点
              </th>
              <th className="sticky top-0 z-10 border-b border-border bg-surface-muted px-3 py-2 text-right text-xs font-semibold text-muted">
                順位
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, pi) => {
              const r = shownById.get(p.participantId);
              return (
                <tr key={p.participantId} className="hover:bg-surface-muted/60">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-r border-border bg-surface px-3 py-1.5 text-left font-medium text-ink"
                  >
                    <span className="flex items-center gap-2">
                      <PlateChip color={plates.get(p.participantId)} />
                      <span className="truncate">{p.displayName}</span>
                    </span>
                    {p.affiliation && <span className="block truncate text-xs font-normal text-muted">{p.affiliation}</span>}
                  </th>
                  {questions.map((q, qi) => {
                    const k = key(p.participantId, q.id);
                    const v: Cell = effective.get(k);
                    const dirty = pending.has(k);
                    return (
                      <td key={q.id} className="border-b border-border p-0.5 text-center">
                        <button
                          ref={(el) => {
                            if (el) refs.current.set(`${pi}:${qi}`, el);
                            else refs.current.delete(`${pi}:${qi}`);
                          }}
                          type="button"
                          disabled={!canGrade}
                          onClick={() => onSet(p.participantId, q.id, v === undefined ? true : v === true ? false : undefined)}
                          onKeyDown={(e) => onKeyDown(e, pi, qi)}
                          aria-label={`${p.displayName} 第${q.number}問 ${v === undefined ? "未採点" : v ? "正解" : "誤答"}`}
                          className={`h-8 w-full min-w-9 rounded-md text-base font-bold transition focus-visible:outline-2 focus-visible:outline-primary ${
                            v === true
                              ? "bg-success-soft text-success"
                              : v === false
                                ? "bg-danger-soft text-danger"
                                : "text-border-strong hover:bg-surface-muted"
                          } ${dirty ? "ring-2 ring-warning" : ""}`}
                        >
                          {v === true ? "○" : v === false ? "×" : "·"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="font-score border-b border-l border-border px-3 text-right font-bold text-ink">
                    {fmt(r?.score ?? null)}
                  </td>
                  <td className="font-score border-b border-border px-3 text-right text-body">{r?.rank ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-sm text-muted">該当する参加者がいません</p>}
      </div>
    </div>
  );
}

/* ----------------------------- 順位 ----------------------------- */

function RankingTable(props: {
  participants: PaperParticipantRow[];
  shownById: Map<string, RankedParticipant>;
  plates: Map<string, string | null>;
  advanceCount: number | null;
  provisional: boolean;
  exportBase: string | null;
}) {
  const sorted = useMemo(
    () =>
      [...props.participants].sort((a, b) => {
        const ra = props.shownById.get(a.participantId)?.rank ?? Infinity;
        const rb = props.shownById.get(b.participantId)?.rank ?? Infinity;
        if (ra !== rb) return ra < rb ? -1 : 1;
        return a.displayName.localeCompare(b.displayName, "ja");
      }),
    [props.participants, props.shownById]
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          通過人数: {props.advanceCount ? `${props.advanceCount}名(境界が同点なら同点者は全員通過)` : "未設定(ラウンド詳細で設定)"}
          {props.provisional && <Badge tone="warning"> 仮順位(未保存の採点を含む)</Badge>}
        </p>
        {props.exportBase && (
          <div className="flex gap-2">
            <a className={linkBtn} href={`${props.exportBase}?type=ranking`}>順位CSV</a>
            <a className={linkBtn} href={`${props.exportBase}?type=answers`}>正誤CSV</a>
          </div>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-surface-muted text-xs text-muted">
            <tr>
              {["順位", "参加者", "得点", "正答", "誤答", "未採点", "通過"].map((h, i) => (
                <th key={h} className={`px-4 py-2.5 font-semibold ${i >= 2 && i <= 5 ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((p) => {
              const r = props.shownById.get(p.participantId);
              return (
                <tr key={p.participantId} className={r?.passed ? "bg-success-soft/40" : ""}>
                  <td className="font-score px-4 py-2 font-bold text-ink">{r?.rank ?? "-"}</td>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2">
                      <PlateChip color={props.plates.get(p.participantId)} />
                      <span className="font-medium text-ink">{p.displayName}</span>
                      {p.affiliation && <span className="text-xs text-muted">{p.affiliation}</span>}
                    </span>
                  </td>
                  <td className="font-score px-4 py-2 text-right font-bold">{fmt(r?.score ?? null)}</td>
                  <td className="font-score px-4 py-2 text-right text-success">{r ? r.correct : "-"}</td>
                  <td className="font-score px-4 py-2 text-right text-danger">{r ? r.wrong : "-"}</td>
                  <td className="font-score px-4 py-2 text-right text-muted">{r ? r.ungraded : "-"}</td>
                  <td className="px-4 py-2">{r?.passed ? <Badge tone="success">通過</Badge> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && <p className="p-6 text-center text-sm text-muted">参加者がいません</p>}
      </div>
    </div>
  );
}

const linkBtn =
  "inline-flex items-center rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-border-strong hover:bg-surface-muted";

/* ----------------------------- 統計 ----------------------------- */

function StatsTable({
  stats,
  provisional,
  exportHref,
}: {
  stats: ReturnType<typeof questionStats>;
  provisional: boolean;
  exportHref: string | null;
}) {
  if (stats.length === 0) return <EmptyNote>設問がありません。「設問設定」で登録してください。</EmptyNote>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          正答率 = 正解 ÷ 採点済み(未採点は含めません)。難しい問題ほど上に出したいときは正答率の列で並べ替えてください。
          {provisional && <Badge tone="warning"> 未保存の採点を含む</Badge>}
        </p>
        {exportHref && <a className={linkBtn} href={exportHref}>統計CSV</a>}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-surface-muted text-xs text-muted">
            <tr>
              {["問題", "配点", "ジャンル等", "正答", "誤答", "未採点", "正答率", "誤答率"].map((h) => (
                <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {stats.map((s) => (
              <tr key={s.questionId}>
                <td className="font-score px-4 py-2 font-bold text-ink">Q{s.number}</td>
                <td className="font-score px-4 py-2">{fmt(s.points)}</td>
                <td className="px-4 py-2 text-muted">{s.label ?? ""}</td>
                <td className="font-score px-4 py-2 text-success">{s.correct}</td>
                <td className="font-score px-4 py-2 text-danger">{s.wrong}</td>
                <td className="font-score px-4 py-2 text-muted">{s.ungraded}</td>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-24 overflow-hidden rounded-full bg-surface-muted">
                      <span className="block h-full bg-primary" style={{ width: `${(s.correctRate ?? 0) * 100}%` }} />
                    </span>
                    <span className="font-score w-12 text-right">{pct(s.correctRate)}</span>
                  </span>
                </td>
                <td className="font-score px-4 py-2">{pct(s.wrongRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ----------------------------- 設問設定 ----------------------------- */

interface QRow {
  id: string;
  number: string;
  points: string;
  label: string;
}

function QuestionsEditor(props: {
  base: string;
  questions: PaperQuestion[];
  canManage: boolean;
  disabledReason: string | null;
  onSaved: () => void;
  setMessage: (m: { tone: "error" | "success"; text: string } | null) => void;
}) {
  const [rows, setRows] = useState<QRow[]>(() => toRows(props.questions));
  const [count, setCount] = useState("20");
  const [points, setPoints] = useState("1");
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const nextId = () => `n${++seq.current}`;

  // サーバーの設問が更新されたら(保存後の refresh)、編集中の表を最新に合わせる。
  const [syncedQuestions, setSyncedQuestions] = useState(props.questions);
  if (syncedQuestions !== props.questions) {
    setSyncedQuestions(props.questions);
    setRows(toRows(props.questions));
  }

  function generate() {
    const n = Math.min(Math.max(parseInt(count, 10) || 0, 0), 500);
    const pt = Number(points);
    if (!n || !Number.isFinite(pt) || pt < 0) return;
    const have = new Set(rows.map((r) => Number(r.number)));
    const add: QRow[] = [];
    for (let i = 1; i <= n; i++) if (!have.has(i)) add.push({ id: nextId(), number: String(i), points: String(pt), label: "" });
    setRows((prev) => [...prev, ...add].sort((a, b) => Number(a.number) - Number(b.number)));
  }

  async function save(allowDelete: boolean) {
    const questions = rows.map((r) => ({
      number: Number(r.number),
      points: Number(r.points),
      label: r.label.trim() ? r.label.trim() : null,
    }));
    if (questions.some((q) => !Number.isInteger(q.number) || q.number < 1 || !Number.isFinite(q.points) || q.points < 0)) {
      props.setMessage({ tone: "error", text: "問題番号は1以上の整数、配点は0以上の数にしてください" });
      return;
    }
    if (new Set(questions.map((q) => q.number)).size !== questions.length) {
      props.setMessage({ tone: "error", text: "問題番号が重複しています" });
      return;
    }
    setBusy(true);
    props.setMessage(null);
    const res = await requestJson(`${props.base}/questions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questions, allowDelete }),
    });
    setBusy(false);
    if (!res.ok) {
      if (res.status === 409 && !allowDelete) {
        if (window.confirm(`${res.message}\nよろしいですか?`)) await save(true);
        return;
      }
      props.setMessage({ tone: "error", text: `設問を保存できませんでした: ${res.message}` });
      return;
    }
    props.setMessage({ tone: "success", text: "設問を保存し、得点と順位を再計算しました" });
    props.onSaved();
  }

  if (!props.canManage) return <EmptyNote>設問の編集には大会管理者の権限が必要です。</EmptyNote>;

  const input = "rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-body">
          問題数(1〜N問を追加)
          <input type="number" min={1} max={500} value={count} onChange={(e) => setCount(e.target.value)} className={`${input} w-24`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-body">
          配点
          <input type="number" min={0} step="any" value={points} onChange={(e) => setPoints(e.target.value)} className={`${input} w-24`} />
        </label>
        <Button variant="secondary" onClick={generate}>一括で追加</Button>
        <p className="text-xs text-muted">既にある番号は変更しません。個別の配点・ジャンルは下の表で直せます。</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-muted text-xs text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">問題番号</th>
              <th className="px-3 py-2 text-left font-semibold">配点</th>
              <th className="px-3 py-2 text-left font-semibold">ジャンル等(任意)</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-1.5">
                  <input type="number" min={1} value={r.number} onChange={(e) => upd(r.id, { number: e.target.value })} className={`${input} w-20`} aria-label="問題番号" />
                </td>
                <td className="px-3 py-1.5">
                  <input type="number" min={0} step="any" value={r.points} onChange={(e) => upd(r.id, { points: e.target.value })} className={`${input} w-20`} aria-label="配点" />
                </td>
                <td className="px-3 py-1.5">
                  <input value={r.label} maxLength={100} onChange={(e) => upd(r.id, { label: e.target.value })} className={`${input} w-full min-w-40`} aria-label="ジャンル等" />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <Button variant="danger" size="sm" onClick={() => setRows((p) => p.filter((x) => x.id !== r.id))}>削除</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-sm text-muted">設問がありません。上のフォームで追加してください。</p>}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={() => save(false)} disabled={busy || !!props.disabledReason}>
          {busy ? "保存中..." : "設問を保存"}
        </Button>
        <Button variant="secondary" onClick={() => setRows((p) => [...p, { id: nextId(), number: String((Math.max(0, ...p.map((x) => Number(x.number) || 0)) || 0) + 1), points: "1", label: "" }])}>
          1問追加
        </Button>
        {props.disabledReason && <span className="text-xs text-warning">{props.disabledReason}</span>}
      </div>
    </div>
  );

  function upd(id: string, patch: Partial<QRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
}

function toRows(qs: PaperQuestion[]): QRow[] {
  return qs.map((q) => ({ id: q.id, number: String(q.number), points: String(q.points), label: q.label ?? "" }));
}

/* ----------------------------- プレート色 ----------------------------- */

function PlatesEditor(props: {
  base: string;
  participants: PaperParticipantRow[];
  plates: Map<string, string | null>;
  canGrade: boolean;
  onApplied: (next: Map<string, string | null>) => void;
  setMessage: (m: { tone: "error" | "success"; text: string } | null) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState("#dc2626");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const l = q ? props.participants.filter((p) => `${p.displayName} ${p.affiliation ?? ""}`.toLowerCase().includes(q)) : props.participants;
    return [...l].sort((a, b) => a.displayName.localeCompare(b.displayName, "ja"));
  }, [props.participants, filter]);

  async function apply(color: string | null) {
    if (selected.size === 0) return;
    setBusy(true);
    props.setMessage(null);
    const ids = [...selected];
    const res = await requestJson<{ updated: number }>(`${props.base}/plates`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments: ids.map((participantId) => ({ participantId, color })) }),
    });
    setBusy(false);
    if (!res.ok) {
      props.setMessage({ tone: "error", text: `プレート色を保存できませんでした: ${res.message}` });
      return;
    }
    const next = new Map(props.plates);
    for (const id of ids) next.set(id, color ? color.toLowerCase() : null);
    props.onApplied(next);
    setSelected(new Set());
    props.setMessage({ tone: "success", text: `${res.data.updated}名のプレート色を${color ? "設定" : "解除"}しました` });
  }

  if (!props.canGrade) return <EmptyNote>プレート色の設定には採点または管理者の権限が必要です。</EmptyNote>;

  const allSelected = list.length > 0 && list.every((p) => selected.has(p.participantId));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-body">参加者を選んで色を押すと、そのラウンドのプレート色として保存します。</p>
        <div className="flex flex-wrap items-center gap-2">
          {PLATE_PALETTE.map((c) => (
            <button
              key={c.hex}
              type="button"
              disabled={busy || selected.size === 0}
              onClick={() => apply(c.hex)}
              style={{ backgroundColor: c.hex, color: plateTextColor(c.hex) }}
              className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
            >
              {c.name}
            </button>
          ))}
          <span className="mx-1 text-border-strong">|</span>
          <input type="color" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="任意の色" className="h-8 w-10 cursor-pointer rounded border border-border-strong bg-surface" />
          <Button variant="secondary" size="sm" disabled={busy || selected.size === 0} onClick={() => apply(custom)}>この色を適用</Button>
          <Button variant="danger" size="sm" disabled={busy || selected.size === 0} onClick={() => apply(null)}>色を解除</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="名前・所属で絞り込み" aria-label="参加者を絞り込み" className="w-64 rounded-xl border border-border-strong bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        <label className="flex items-center gap-2 text-sm text-body">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => setSelected(e.target.checked ? new Set(list.map((p) => p.participantId)) : new Set())}
          />
          表示中の{list.length}名をすべて選択
        </label>
        <span className="text-xs text-muted">{selected.size}名 選択中</span>
      </div>

      <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => (
          <li key={p.participantId}>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-muted">
              <input
                type="checkbox"
                checked={selected.has(p.participantId)}
                onChange={(e) =>
                  setSelected((prev) => {
                    const n = new Set(prev);
                    if (e.target.checked) n.add(p.participantId);
                    else n.delete(p.participantId);
                    return n;
                  })
                }
              />
              <PlateChip color={props.plates.get(p.participantId)} />
              <span className="truncate font-medium text-ink">{p.displayName}</span>
              {p.affiliation && <span className="truncate text-xs text-muted">{p.affiliation}</span>}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border-strong bg-surface px-4 py-8 text-center text-sm text-muted">{children}</div>;
}
