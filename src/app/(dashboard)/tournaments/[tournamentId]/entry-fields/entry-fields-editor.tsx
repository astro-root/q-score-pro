"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Database, EntryFieldType } from "@/types/database";

type EntryFormField = Database["public"]["Tables"]["entry_form_fields"]["Row"];

type DraftField = {
  fieldKey: string;
  label: string;
  fieldType: EntryFieldType;
  isRequired: boolean;
  optionsText: string; // comma separated, only used for SELECT
};

const FIELD_TYPE_LABEL: Record<EntryFieldType, string> = {
  TEXT: "一行テキスト",
  TEXTAREA: "複数行テキスト",
  EMAIL: "メールアドレス",
  NUMBER: "数値",
  SELECT: "選択式",
  CHECKBOX: "チェックボックス",
};

export function EntryFieldsEditor({
  tournamentId,
  initialFields,
}: {
  tournamentId: string;
  initialFields: EntryFormField[];
}) {
  const router = useRouter();
  const [fields, setFields] = useState<DraftField[]>(
    initialFields.map((f) => ({
      fieldKey: f.field_key,
      label: f.label,
      fieldType: f.field_type,
      isRequired: f.is_required,
      optionsText: (f.options ?? []).join(", "),
    }))
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function update(index: number, patch: Partial<DraftField>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function remove(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }

  function add() {
    setFields((prev) => [
      ...prev,
      { fieldKey: "", label: "", fieldType: "TEXT", isRequired: false, optionsText: "" },
    ]);
  }

  async function save() {
    setPending(true);
    setError(null);
    setMessage(null);

    const res = await fetch(`/api/tournaments/${tournamentId}/entry-fields`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: fields.map((f) => ({
          fieldKey: f.fieldKey,
          label: f.label,
          fieldType: f.fieldType,
          isRequired: f.isRequired,
          options:
            f.fieldType === "SELECT"
              ? f.optionsText
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : undefined,
        })),
      }),
    });

    setPending(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.message ?? "保存に失敗しました(項目キーが重複していないか確認してください)");
      return;
    }
    setMessage("保存しました");
    router.refresh();
  }

  const inputClass =
    "rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-500">
        氏名・メールアドレス・所属は標準項目として常にエントリーフォームに含まれます。ここでは大会独自の項目を追加できます。
      </p>

      <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5">
        {fields.length === 0 && (
          <p className="text-sm text-slate-400">まだ独自項目はありません</p>
        )}
        {fields.map((f, index) => (
          <div key={index} className="grid gap-2 border-b border-slate-100 pb-4 last:border-0 sm:grid-cols-6">
            <input
              value={f.fieldKey}
              onChange={(e) => update(index, { fieldKey: e.target.value })}
              placeholder="項目キー (例: grade)"
              className={`${inputClass} sm:col-span-2 font-mono`}
            />
            <input
              value={f.label}
              onChange={(e) => update(index, { label: e.target.value })}
              placeholder="表示ラベル (例: 学年)"
              className={`${inputClass} sm:col-span-2`}
            />
            <select
              value={f.fieldType}
              onChange={(e) => update(index, { fieldType: e.target.value as EntryFieldType })}
              className={inputClass}
            >
              {Object.entries(FIELD_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={f.isRequired}
                  onChange={(e) => update(index, { isRequired: e.target.checked })}
                />
                必須
              </label>
              <button
                type="button"
                onClick={() => remove(index)}
                className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                削除
              </button>
            </div>
            {f.fieldType === "SELECT" && (
              <input
                value={f.optionsText}
                onChange={(e) => update(index, { optionsText: e.target.value })}
                placeholder="選択肢をカンマ区切りで入力 (例: 中学生, 高校生, 一般)"
                className={`${inputClass} sm:col-span-6`}
              />
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="self-start rounded-md border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          + 項目を追加
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-600">{message}</p>}

      <button
        onClick={save}
        disabled={pending}
        className="self-start rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
      >
        {pending ? "保存中..." : "保存"}
      </button>
    </div>
  );
}
