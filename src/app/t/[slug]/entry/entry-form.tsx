"use client";

import { useState } from "react";
import type { Database } from "@/types/database";

type EntryFormField = Database["public"]["Tables"]["entry_form_fields"]["Row"];

export function EntryForm({
  tournamentId,
  fields,
}: {
  tournamentId: string;
  fields: EntryFormField[];
}) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function setAnswer(key: string, value: string | boolean) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const res = await fetch(`/api/tournaments/${tournamentId}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName,
        email,
        affiliation: affiliation || undefined,
        answers,
      }),
    });

    setPending(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.message ?? "エントリーに失敗しました。入力内容をご確認ください。");
      return;
    }

    setDone(true);
  }

  const inputClass =
    "rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  if (done) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
        <p className="font-medium text-emerald-800">エントリーを受け付けました</p>
        <p className="mt-1 text-sm text-emerald-700">大会情報は主催者からの連絡をお待ちください。</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-700">氏名 / 表示名</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-700">メールアドレス</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-700">所属(任意)</label>
        <input
          value={affiliation}
          onChange={(e) => setAffiliation(e.target.value)}
          className={inputClass}
        />
      </div>

      {fields.map((f) => (
        <div key={f.id} className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">
            {f.label}
            {f.is_required && <span className="ml-1 text-red-500">*</span>}
          </label>
          {f.field_type === "TEXTAREA" ? (
            <textarea
              required={f.is_required}
              rows={3}
              onChange={(e) => setAnswer(f.field_key, e.target.value)}
              className={inputClass}
            />
          ) : f.field_type === "SELECT" ? (
            <select
              required={f.is_required}
              defaultValue=""
              onChange={(e) => setAnswer(f.field_key, e.target.value)}
              className={inputClass}
            >
              <option value="" disabled>
                選択してください
              </option>
              {(f.options ?? []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : f.field_type === "CHECKBOX" ? (
            <input
              type="checkbox"
              onChange={(e) => setAnswer(f.field_key, e.target.checked)}
              className="h-4 w-4 self-start"
            />
          ) : (
            <input
              type={f.field_type === "EMAIL" ? "email" : f.field_type === "NUMBER" ? "number" : "text"}
              required={f.is_required}
              onChange={(e) => setAnswer(f.field_key, e.target.value)}
              className={inputClass}
            />
          )}
        </div>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
      >
        {pending ? "送信中..." : "エントリーする"}
      </button>
    </form>
  );
}
