"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function EntrySearchBar({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/tournaments/${tournamentId}/entries?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <input
        defaultValue={searchParams.get("q") ?? ""}
        onChange={(e) => updateParam("q", e.target.value)}
        placeholder="氏名・メール・所属で検索"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-64 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <select
        defaultValue={searchParams.get("status") ?? ""}
        onChange={(e) => updateParam("status", e.target.value)}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <option value="">すべてのステータス</option>
        <option value="SUBMITTED">エントリー済み</option>
        <option value="WITHDRAWN">辞退</option>
      </select>
      <a
        href={`/api/tournaments/${tournamentId}/entries/export`}
        className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        CSVエクスポート
      </a>
    </div>
  );
}
