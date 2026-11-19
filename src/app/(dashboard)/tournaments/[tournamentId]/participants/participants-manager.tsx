"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Database } from "@/types/database";

type Participant = Database["public"]["Tables"]["participants"]["Row"];
type Entry = Database["public"]["Tables"]["entries"]["Row"];

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "有効",
  DISQUALIFIED: "失格",
  ABSENT: "欠場",
  WITHDRAWN: "辞退",
};

export function ParticipantsManager({
  tournamentId,
  initialParticipants,
  unimportedEntries,
  canExport = false,
}: {
  tournamentId: string;
  initialParticipants: Participant[];
  unimportedEntries: Entry[];
  canExport?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialParticipants.filter(
      (p) =>
        (!statusFilter || p.status === statusFilter) &&
        (!q || `${p.display_name} ${p.affiliation ?? ""}`.toLowerCase().includes(q))
    );
  }, [initialParticipants, query, statusFilter]);
  const [displayName, setDisplayName] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [pending, setPending] = useState(false);
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    await fetch(`/api/tournaments/${tournamentId}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, affiliation: affiliation || undefined }),
    });
    setPending(false);
    setDisplayName("");
    setAffiliation("");
    router.refresh();
  }

  async function handleImport() {
    if (selectedEntryIds.length === 0) return;
    setImporting(true);
    await fetch(`/api/tournaments/${tournamentId}/participants/import-from-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryIds: selectedEntryIds }),
    });
    setImporting(false);
    setSelectedEntryIds([]);
    router.refresh();
  }

  async function updateStatus(participant: Participant, status: string) {
    await fetch(`/api/tournaments/${tournamentId}/participants/${participant.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  const inputClass =
    "rounded-md border border-border-strong px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary-hover";

  return (
    <div className="flex flex-col gap-6">
      {unimportedEntries.length > 0 && (
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold text-body">
            エントリーから参加者を確定 ({unimportedEntries.length}件未取り込み)
          </h2>
          <ul className="mb-3 max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {unimportedEntries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedEntryIds.includes(entry.id)}
                  onChange={(e) =>
                    setSelectedEntryIds((prev) =>
                      e.target.checked ? [...prev, entry.id] : prev.filter((id) => id !== entry.id)
                    )
                  }
                />
                <span className="font-medium text-ink">{entry.display_name}</span>
                <span className="text-muted">{entry.email}</span>
              </li>
            ))}
          </ul>
          <button
            onClick={handleImport}
            disabled={importing || selectedEntryIds.length === 0}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50"
          >
            {importing ? "取り込み中..." : `選択した${selectedEntryIds.length}件を参加者にする`}
          </button>
        </section>
      )}

      <form
        onSubmit={handleAdd}
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-sm font-medium text-body">氏名 (手動追加)</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className={inputClass}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-sm font-medium text-body">所属</label>
          <input
            value={affiliation}
            onChange={(e) => setAffiliation(e.target.value)}
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          追加
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="氏名・所属で検索"
            aria-label="参加者を検索"
            className="w-64 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="ステータスで絞り込み"
            className="rounded-md border border-border-strong bg-surface px-2 py-2 text-sm"
          >
            <option value="">すべてのステータス</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted">
            {visible.length} / {initialParticipants.length} 名
          </span>
        </div>
        {canExport && (
          <a
            href={`/api/tournaments/${tournamentId}/participants/export${statusFilter ? `?status=${statusFilter}` : ""}`}
            className="inline-flex items-center rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-border-strong hover:bg-surface-muted"
          >
            CSVエクスポート{statusFilter ? `(${STATUS_LABEL[statusFilter]}のみ)` : ""}
          </a>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-canvas text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">氏名</th>
              <th className="px-4 py-3">所属</th>
              <th className="px-4 py-3">ステータス</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted">
                  {initialParticipants.length === 0 ? "まだ参加者がいません" : "条件に一致する参加者がいません"}
                </td>
              </tr>
            )}
            {visible.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium text-ink">{p.display_name}</td>
                <td className="px-4 py-3 text-body">{p.affiliation ?? "-"}</td>
                <td className="px-4 py-3">
                  <select
                    value={p.status}
                    onChange={(e) => updateStatus(p, e.target.value)}
                    className="rounded-md border border-border-strong px-2 py-1 text-xs"
                  >
                    {Object.entries(STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
