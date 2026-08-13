"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const NEXT_STATUS: Record<string, string | null> = {
  DRAFT: "REGISTRATION_OPEN",
  REGISTRATION_OPEN: "REGISTRATION_CLOSED",
  REGISTRATION_CLOSED: "RUNNING",
  RUNNING: "FINISHED",
  FINISHED: "PUBLISHED",
  PUBLISHED: null,
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "下書き",
  REGISTRATION_OPEN: "エントリー受付中",
  REGISTRATION_CLOSED: "エントリー締切",
  RUNNING: "開催中",
  FINISHED: "終了",
  PUBLISHED: "結果公開",
};

export function StatusControl({
  tournamentId,
  currentStatus,
}: {
  tournamentId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const next = NEXT_STATUS[currentStatus];

  function advance() {
    if (!next) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/tournaments/${tournamentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? "ステータスの更新に失敗しました");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <p className="mb-3 text-sm text-slate-600">現在: {STATUS_LABEL[currentStatus]}</p>
      {next ? (
        <button
          onClick={advance}
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          {pending ? "更新中..." : `${STATUS_LABEL[next]} に進める`}
        </button>
      ) : (
        <p className="text-sm text-slate-400">これ以上進める状態はありません</p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
