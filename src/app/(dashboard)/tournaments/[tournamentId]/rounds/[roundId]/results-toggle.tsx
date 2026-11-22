"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestJson } from "@/lib/api/request";
import { FormMessage } from "@/components/ui/Field";

export function ResultsToggle({
  tournamentId,
  roundId,
  initialPublic,
  tournamentPublished,
}: {
  tournamentId: string;
  roundId: string;
  initialPublic: boolean;
  tournamentPublished: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialPublic);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: boolean) {
    setBusy(true);
    setError(null);
    const res = await requestJson(`/api/tournaments/${tournamentId}/rounds/${roundId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultsPublic: next }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(`変更できませんでした: ${res.message}`);
      return;
    }
    setValue(next);
    router.refresh();
  }

  return (
    <div className="mb-6 rounded-xl border border-border bg-surface p-4">
      <label className="flex items-start gap-2 text-sm text-body">
        <input
          type="checkbox"
          checked={value}
          disabled={busy}
          onChange={(e) => change(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          <strong className="text-ink">このラウンドの結果を大会ページに公開する</strong>
          <span className="mt-0.5 block text-xs text-muted">
            公開されるのは 順位・表示名・所属・得点・通過 のみです(メールアドレス等は出ません)。失格・欠場などの参加者は除かれます。
          </span>
          <span className={`mt-1 block text-xs ${tournamentPublished ? "text-success" : "text-warning"}`}>
            {tournamentPublished
              ? "大会ステータスが「結果公開」なので、チェックすると公開ページに表示されます。"
              : "大会ステータスが「結果公開」になるまで、チェックしても公開ページには表示されません。"}
          </span>
        </span>
      </label>
      {error && (
        <div className="mt-2">
          <FormMessage tone="error">{error}</FormMessage>
        </div>
      )}
    </div>
  );
}
