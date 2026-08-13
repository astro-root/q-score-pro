"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Database } from "@/types/database";

type ScheduleItem = Database["public"]["Tables"]["schedule_items"]["Row"];

type DraftItem = { label: string; scheduledAt: string };

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleEditor({
  tournamentId,
  initialItems,
}: {
  tournamentId: string;
  initialItems: ScheduleItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<DraftItem[]>(
    initialItems.map((i) => ({ label: i.label, scheduledAt: toLocalInputValue(i.scheduled_at) }))
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function update(index: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function move(index: number, dir: -1 | 1) {
    setItems((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function remove(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function add() {
    setItems((prev) => [...prev, { label: "", scheduledAt: "" }]);
  }

  async function save() {
    setPending(true);
    setMessage(null);

    const res = await fetch(`/api/tournaments/${tournamentId}/schedule`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items
          .filter((i) => i.label.trim() !== "")
          .map((i) => ({
            label: i.label,
            scheduledAt: i.scheduledAt ? new Date(i.scheduledAt).toISOString() : null,
          })),
      }),
    });

    setPending(false);

    if (!res.ok) {
      setMessage("保存に失敗しました");
      return;
    }
    setMessage("保存しました");
    router.refresh();
  }

  const inputClass =
    "rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5">
        {items.length === 0 && (
          <p className="text-sm text-slate-400">まだスケジュール項目がありません</p>
        )}
        {items.map((item, index) => (
          <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={item.label}
              onChange={(e) => update(index, { label: e.target.value })}
              placeholder="項目名(例: 開会式)"
              className={`${inputClass} sm:flex-1`}
            />
            <input
              type="datetime-local"
              value={item.scheduledAt}
              onChange={(e) => update(index, { scheduledAt: e.target.value })}
              className={inputClass}
            />
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => move(index, -1)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => remove(index)}
                className="rounded-md border border-red-200 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50"
              >
                削除
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="self-start rounded-md border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          + 項目を追加
        </button>
      </div>

      {message && <p className="text-sm text-emerald-600">{message}</p>}

      <button
        onClick={save}
        disabled={pending}
        className="self-start rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
      >
        {pending ? "保存中..." : "保存"}
      </button>
    </div>
  );
}
