"use client";

import type { EntryFieldType } from "@/types/database";

/** 公開フォームと、管理画面のプレビューで同じ部品を使う(見た目の食い違いを防ぐ)。 */
export interface EntryFieldDef {
  field_key: string;
  label: string;
  field_type: EntryFieldType;
  is_required: boolean;
  options: string[] | null;
}

export type EntryAnswer = string | boolean | undefined;

const inputClass =
  "rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export function EntryFieldInput({
  field,
  value,
  onChange,
  idPrefix = "f",
}: {
  field: EntryFieldDef;
  value: EntryAnswer;
  onChange: (value: string | boolean) => void;
  idPrefix?: string;
}) {
  const id = `${idPrefix}-${field.field_key}`;
  const required = field.is_required;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-body">
        {field.label}
        {required && (
          <span className="ml-1 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {field.field_type === "TEXTAREA" ? (
        <textarea
          id={id}
          required={required}
          rows={3}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      ) : field.field_type === "SELECT" ? (
        <select
          id={id}
          required={required}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        >
          <option value="" disabled>
            選択してください
          </option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : field.field_type === "CHECKBOX" ? (
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 self-start"
        />
      ) : (
        <input
          id={id}
          type={field.field_type === "EMAIL" ? "email" : field.field_type === "NUMBER" ? "number" : "text"}
          required={required}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      )}
    </div>
  );
}
