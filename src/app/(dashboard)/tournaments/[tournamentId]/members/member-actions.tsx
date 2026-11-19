"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestJson } from "@/lib/api/request";
import { ROLE_OPTIONS } from "./role-options";

/**
 * 1人分のスタッフ操作(ロール変更・削除)。失敗したら必ず画面にエラーを出す。
 * OWNER と自分自身には表示しない(呼び出し側で判定)。
 */
export function MemberActions({
  tournamentId,
  memberId,
  currentRole,
  displayName,
}: {
  tournamentId: string;
  memberId: string;
  currentRole: string;
  displayName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeRole(role: string) {
    if (role === currentRole) return;
    setPending(true);
    setError(null);
    const r = await requestJson(`/api/tournaments/${tournamentId}/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setPending(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`${displayName} をスタッフから外しますか?`)) return;
    setPending(true);
    setError(null);
    const r = await requestJson(`/api/tournaments/${tournamentId}/members/${memberId}`, {
      method: "DELETE",
    });
    setPending(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <select
          value={currentRole}
          disabled={pending}
          onChange={(e) => changeRole(e.target.value)}
          aria-label={`${displayName} のロール`}
          className="rounded-md border border-border-strong px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="rounded-md border border-danger/30 px-2 py-1 text-xs font-medium text-danger transition hover:bg-danger-soft disabled:opacity-60"
        >
          外す
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
