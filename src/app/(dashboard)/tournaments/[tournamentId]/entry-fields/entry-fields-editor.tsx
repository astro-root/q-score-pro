"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Database, EntryFieldType } from "@/types/database";
import { requestJson } from "@/lib/api/request";
import { moveItem, nextFieldKey, parseOptions, validateFieldDrafts } from "@/lib/entries/fields";
import { EntryFieldInput, type EntryAnswer } from "@/components/entry/EntryFieldInput";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/Field";

type EntryFormField = Database["public"]["Tables"]["entry_form_fields"]["Row"];

type DraftField = {
  uid: string;
  fieldKey: string;
  label: string;
  fieldType: EntryFieldType;
  isRequired: boolean;
  optionsText: string;
  /** 保存済みの項目。キーは過去の回答と結びついているので変更させない */
  saved: boolean;
};

const FIELD_TYPE_LABEL: Record<EntryFieldType, string> = {
  TEXT: "一行テキスト",
  TEXTAREA: "複数行テキスト",
  EMAIL: "メールアドレス",
  NUMBER: "数値",
  SELECT: "選択式",
  CHECKBOX: "チェックボックス",
};

const inputClass =
  "rounded-md border border-border-strong bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

const snapshot = (fields: DraftField[]) =>
  JSON.stringify(fields.map(({ fieldKey, label, fieldType, isRequired, optionsText }) => [fieldKey, label, fieldType, isRequired, optionsText]));

export function EntryFieldsEditor({
  tournamentId,
  initialFields,
}: {
  tournamentId: string;
  initialFields: EntryFormField[];
}) {
  const router = useRouter();
  const [fields, setFields] = useState<DraftField[]>(() =>
    initialFields.map((f) => ({
      uid: f.id,
      fieldKey: f.field_key,
      label: f.label,
      fieldType: f.field_type,
      isRequired: f.is_required,
      optionsText: (f.options ?? []).join(", "),
      saved: true,
    }))
  );
  const [savedSnapshot, setSavedSnapshot] = useState(() => snapshot(fields));
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const errors = useMemo(() => validateFieldDrafts(fields), [fields]);
  const dirty = snapshot(fields) !== savedSnapshot;

  const update = (index: number, patch: Partial<DraftField>) =>
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));

  function add() {
    setFields((prev) => [
      ...prev,
      {
        uid: `new-${Date.now()}-${prev.length}`,
        fieldKey: nextFieldKey(prev.map((f) => f.fieldKey)),
        label: "",
        fieldType: "TEXT",
        isRequired: false,
        optionsText: "",
        saved: false,
      },
    ]);
  }

  function remove(index: number) {
    const f = fields[index];
    if (f.saved && !window.confirm(`「${f.label || f.fieldKey}」を削除します。\n過去の回答は残りますが、フォームには表示されなくなります。よろしいですか?`)) return;
    setFields((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    setShowErrors(true);
    if (errors.size > 0) {
      setMessage({ tone: "error", text: `${errors.size}件の入力に問題があります。赤字の項目を確認してください` });
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await requestJson(`/api/tournaments/${tournamentId}/entry-fields`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: fields.map((f) => ({
          fieldKey: f.fieldKey,
          label: f.label.trim(),
          fieldType: f.fieldType,
          isRequired: f.isRequired,
          options: f.fieldType === "SELECT" ? parseOptions(f.optionsText) : undefined,
        })),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setMessage({ tone: "error", text: `保存できませんでした: ${res.message}` });
      return;
    }
    const next = fields.map((f) => ({ ...f, saved: true }));
    setFields(next);
    setSavedSnapshot(snapshot(next));
    setShowErrors(false);
    setMessage({ tone: "success", text: "保存しました。公開フォームに反映されています" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="flex gap-1 border-b border-border">
        {(
          [
            ["edit", "項目の編集"],
            ["preview", "プレビュー"],
          ] as const
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
        {dirty && <Badge tone="warning">未保存の変更</Badge>}
      </div>

      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}

      {tab === "edit" ? (
        <>
          <p className="text-sm text-muted">
            氏名・メールアドレス・所属は標準項目として常にフォームに含まれます。ここでは大会独自の項目を追加し、上下ボタンで並べ替えられます。
          </p>

          <ol className="flex flex-col gap-3">
            {fields.length === 0 && (
              <li className="rounded-xl border border-dashed border-border-strong bg-surface px-4 py-6 text-center text-sm text-muted">
                まだ独自項目はありません。「項目を追加」から作成できます。
              </li>
            )}
            {fields.map((f, index) => {
              const err = showErrors ? errors.get(index) : undefined;
              return (
                <li key={f.uid} className={`rounded-xl border bg-surface p-4 ${err ? "border-danger" : "border-border"}`}>
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex flex-col gap-1" aria-label={`${index + 1}番目の項目を移動`}>
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => setFields((p) => moveItem(p, index, -1))}
                        aria-label="上へ移動"
                        className="rounded border border-border px-2 py-0.5 text-xs text-body hover:bg-surface-muted disabled:opacity-30"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={index === fields.length - 1}
                        onClick={() => setFields((p) => moveItem(p, index, 1))}
                        aria-label="下へ移動"
                        className="rounded border border-border px-2 py-0.5 text-xs text-body hover:bg-surface-muted disabled:opacity-30"
                      >
                        ▼
                      </button>
                    </div>

                    <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-6">
                      <input
                        value={f.label}
                        onChange={(e) => update(index, { label: e.target.value })}
                        placeholder="表示ラベル (例: 学年)"
                        aria-label="表示ラベル"
                        className={`${inputClass} sm:col-span-3`}
                      />
                      <select
                        value={f.fieldType}
                        onChange={(e) => update(index, { fieldType: e.target.value as EntryFieldType })}
                        aria-label="入力形式"
                        className={`${inputClass} sm:col-span-2`}
                      >
                        {Object.entries(FIELD_TYPE_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1 text-sm text-body">
                        <input type="checkbox" checked={f.isRequired} onChange={(e) => update(index, { isRequired: e.target.checked })} />
                        必須
                      </label>
                      {f.fieldType === "SELECT" && (
                        <textarea
                          value={f.optionsText}
                          onChange={(e) => update(index, { optionsText: e.target.value })}
                          rows={2}
                          placeholder="選択肢をカンマまたは改行で区切って入力 (例: 中学生, 高校生, 一般)"
                          aria-label="選択肢"
                          className={`${inputClass} sm:col-span-6`}
                        />
                      )}
                      <details className="text-xs text-muted sm:col-span-6">
                        <summary className="cursor-pointer">項目キー(回答の保存に使う内部名)</summary>
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            value={f.fieldKey}
                            disabled={f.saved}
                            onChange={(e) => update(index, { fieldKey: e.target.value })}
                            aria-label="項目キー"
                            className={`${inputClass} w-56 font-mono disabled:bg-surface-muted`}
                          />
                          {f.saved && <span>保存済みの項目のキーは、過去の回答との対応が崩れるため変更できません</span>}
                        </div>
                      </details>
                      {err && (
                        <p role="alert" className="text-xs font-medium text-danger sm:col-span-6">
                          {err}
                        </p>
                      )}
                    </div>

                    <Button variant="danger" size="sm" onClick={() => remove(index)}>
                      削除
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={add}>
              + 項目を追加
            </Button>
            <Button onClick={save} disabled={busy || !dirty}>
              {busy ? "保存中..." : "保存"}
            </Button>
          </div>
        </>
      ) : (
        <FormPreview fields={fields} />
      )}
    </div>
  );
}

/** 応募者に見える形のプレビュー。公開フォームと同じ EntryFieldInput を使う。送信はしない。 */
function FormPreview({ fields }: { fields: DraftField[] }) {
  const [answers, setAnswers] = useState<Record<string, EntryAnswer>>({});
  return (
    <div className="mx-auto w-full max-w-lg">
      <p className="mb-3 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
        プレビューです。ここで入力しても送信・保存はされません(未保存の変更も反映されています)。
      </p>
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="flex flex-col gap-4">
          <PreviewFixed label="氏名 / 表示名" required />
          <PreviewFixed label="メールアドレス" required type="email" />
          <PreviewFixed label="所属(任意)" />
          {fields.map((f) => (
            <EntryFieldInput
              key={f.uid}
              idPrefix="preview"
              field={{
                field_key: f.fieldKey || f.uid,
                label: f.label || "(ラベル未入力)",
                field_type: f.fieldType,
                is_required: f.isRequired,
                options: f.fieldType === "SELECT" ? parseOptions(f.optionsText) : null,
              }}
              value={answers[f.uid]}
              onChange={(v) => setAnswers((prev) => ({ ...prev, [f.uid]: v }))}
            />
          ))}
          <button type="button" disabled className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white opacity-60">
            エントリーする(プレビューでは送信されません)
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewFixed({ label, required, type = "text" }: { label: string; required?: boolean; type?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-body">
        {label}
        {required && (
          <span className="ml-1 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <input type={type} className={inputClass} />
    </div>
  );
}
