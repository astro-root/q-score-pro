"use client";

import type { RuleConfig, WinCondition } from "@/lib/rules/types";

const inputClass =
  "rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const WIN_CONDITION_LABEL: Record<WinCondition["type"], string> = {
  OPEN: "制限なし(スタッフが手動でラウンドを終了)",
  SCORE_TARGET: "得点先取・勝ち抜け(目標得点)",
  QUESTION_COUNT: "問題数制",
  TIME_LIMIT: "時間制",
};

function defaultWinCondition(type: WinCondition["type"]): WinCondition {
  switch (type) {
    case "SCORE_TARGET":
      return { type: "SCORE_TARGET", targetScore: 100 };
    case "QUESTION_COUNT":
      return { type: "QUESTION_COUNT", questionCount: 10 };
    case "TIME_LIMIT":
      return { type: "TIME_LIMIT", timeLimitSeconds: 300 };
    default:
      return { type: "OPEN" };
  }
}

export function RuleConfigEditor({
  value,
  onChange,
}: {
  value: RuleConfig;
  onChange: (next: RuleConfig) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">正解時の得点</label>
          <input
            type="number"
            value={value.correctPoints}
            onChange={(e) => onChange({ ...value, correctPoints: Number(e.target.value) })}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">誤答時の減点</label>
          <input
            type="number"
            value={value.wrongPenalty}
            onChange={(e) => onChange({ ...value, wrongPenalty: Number(e.target.value) })}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">スルー時の得点変動</label>
          <input
            type="number"
            value={value.throughPenalty}
            onChange={(e) => onChange({ ...value, throughPenalty: Number(e.target.value) })}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">誤答回数の上限(空欄=無制限)</label>
          <input
            type="number"
            min={1}
            value={value.maxWrongAnswers ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                maxWrongAnswers: e.target.value ? Number(e.target.value) : null,
              })
            }
            className={inputClass}
          />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={value.disqualifyOnMaxWrong}
            onChange={(e) => onChange({ ...value, disqualifyOnMaxWrong: e.target.checked })}
          />
          誤答回数の上限で自動失格にする
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-slate-600">勝利・終了条件</label>
        <select
          value={value.winCondition.type}
          onChange={(e) => onChange({ ...value, winCondition: defaultWinCondition(e.target.value as WinCondition["type"]) })}
          className={inputClass}
        >
          {Object.entries(WIN_CONDITION_LABEL).map(([type, label]) => (
            <option key={type} value={type}>
              {label}
            </option>
          ))}
        </select>

        {value.winCondition.type === "SCORE_TARGET" && (
          <input
            type="number"
            value={value.winCondition.targetScore}
            onChange={(e) =>
              onChange({
                ...value,
                winCondition: { type: "SCORE_TARGET", targetScore: Number(e.target.value) },
              })
            }
            placeholder="目標得点"
            className={inputClass}
          />
        )}
        {value.winCondition.type === "QUESTION_COUNT" && (
          <input
            type="number"
            value={value.winCondition.questionCount}
            onChange={(e) =>
              onChange({
                ...value,
                winCondition: { type: "QUESTION_COUNT", questionCount: Number(e.target.value) },
              })
            }
            placeholder="問題数"
            className={inputClass}
          />
        )}
        {value.winCondition.type === "TIME_LIMIT" && (
          <input
            type="number"
            value={value.winCondition.timeLimitSeconds}
            onChange={(e) =>
              onChange({
                ...value,
                winCondition: { type: "TIME_LIMIT", timeLimitSeconds: Number(e.target.value) },
              })
            }
            placeholder="制限時間(秒)"
            className={inputClass}
          />
        )}
      </div>
    </div>
  );
}
