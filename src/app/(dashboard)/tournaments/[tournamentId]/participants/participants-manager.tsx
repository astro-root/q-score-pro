"use client";

import { useState } from "react";
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
}: {
  tournamentId: string;
  initialParticipants: Participant[];
  unimportedEntries: Entry[];
}) {
  const router = useRouter();
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
    "rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  return (
    <div className="flex flex-col gap-6">
      {unimportedEntries.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            エントリーから参加者を確定 ({unimportedEntries.length}件未取り込み)
          </h2>
          <ul className="mb-3 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-100">
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
                <span className="font-medium text-slate-800">{entry.display_name}</span>
                <span className="text-slate-400">{entry.email}</span>
              </li>
            ))}
          </ul>
          <button
            onClick={handleImport}
            disabled={importing || selectedEntryIds.length === 0}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {importing ? "取り込み中..." : `選択した${selectedEntryIds.length}件を参加者にする`}
          </button>
        </section>
      )}

      <form
        onSubmit={handleAdd}
        className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5 sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">氏名 (手動追加)</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className={inputClass}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">所属</label>
          <input
            value={affiliation}
            onChange={(e) => setAffiliation(e.target.value)}
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          追加
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">氏名</th>
              <th className="px-4 py-3">所属</th>
              <th className="px-4 py-3">ステータス</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {initialParticipants.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                  まだ参加者がいません
                </td>
              </tr>
            )}
            {initialParticipants.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{p.display_name}</td>
                <td className="px-4 py-3 text-slate-600">{p.affiliation ?? "-"}</td>
                <td className="px-4 py-3">
                  <select
                    value={p.status}
                    onChange={(e) => updateStatus(p, e.target.value)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
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
