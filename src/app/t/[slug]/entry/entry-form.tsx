"use client";

import { useState } from "react";
import type { Database } from "@/types/database";
import { EntryFieldInput } from "@/components/entry/EntryFieldInput";

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
    "rounded-md border border-border-strong px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

  if (done) {
    return (
      <div className="rounded-lg border border-success/30 bg-success-soft p-6 text-center">
        <p className="font-medium text-success">エントリーを受け付けました</p>
        <p className="mt-1 text-sm text-success">大会情報は主催者からの連絡をお待ちください。</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-body">氏名 / 表示名</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-body">メールアドレス</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-body">所属(任意)</label>
        <input
          value={affiliation}
          onChange={(e) => setAffiliation(e.target.value)}
          className={inputClass}
        />
      </div>

      {fields.map((f) => (
        <EntryFieldInput
          key={f.id}
          field={f}
          value={answers[f.field_key]}
          onChange={(v) => setAnswer(f.field_key, v)}
          idPrefix="entry"
        />
      ))}

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "送信中..." : "エントリーする"}
      </button>
    </form>
  );
}
