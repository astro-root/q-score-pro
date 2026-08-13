"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "大会管理者" },
  { value: "QUESTION_MANAGER", label: "問題管理者" },
  { value: "SCORE_OPERATOR", label: "得点オペレーター" },
  { value: "GRADER", label: "採点担当" },
  { value: "STREAM_OPERATOR", label: "配信担当" },
  { value: "VENUE_STAFF", label: "会場スタッフ" },
  { value: "VIEWER", label: "閲覧専用" },
];

export function InviteForm({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("VIEWER");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const res = await fetch(`/api/tournaments/${tournamentId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });

    setPending(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(
        body.error === "user_not_found"
          ? body.message
          : body.error === "invalid_input"
            ? "入力内容を確認してください"
            : "追加に失敗しました(既に登録済みの可能性があります)"
      );
      return;
    }

    setEmail("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1">
        <label className="text-sm font-medium text-slate-700">メールアドレス</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder="staff@example.com"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-700">権限</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
      >
        {pending ? "追加中..." : "追加"}
      </button>
      {error && <p className="text-sm text-red-600 sm:ml-2">{error}</p>}
    </form>
  );
}
