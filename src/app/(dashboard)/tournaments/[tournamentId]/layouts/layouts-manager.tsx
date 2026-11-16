"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { requestJson } from "@/lib/api/request";
import { MAX_IMPORT_BYTES } from "@/lib/display/limits";

interface LayoutSummary {
  id: string;
  name: string;
  updated_at: string;
}

interface RoundOption {
  id: string;
  name: string;
}

export function LayoutsManager({
  tournamentId,
  initialLayouts,
  rounds,
}: {
  tournamentId: string;
  initialLayouts: LayoutSummary[];
  rounds: RoundOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [obsRoundByLayout, setObsRoundByLayout] = useState<Record<string, string>>({});
  const [copiedLayoutId, setCopiedLayoutId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<{ layoutId: string; warnings: string[] } | null>(
    null
  );

  async function create(duplicateFromId?: string) {
    if (!name && !duplicateFromId) return;
    setPending(true);
    setError(null);
    const r = await requestJson<{ layout: { id: string } }>(`/api/tournaments/${tournamentId}/layouts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name || `複製 (${new Date().toLocaleTimeString("ja-JP")})`,
        duplicateFromId,
      }),
    });
    setPending(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    router.push(`/tournaments/${tournamentId}/layouts/${r.data.layout.id}`);
  }

  async function remove(layoutId: string, layoutName: string) {
    if (!confirm(`「${layoutName}」を削除しますか?`)) return;
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/layouts/${layoutId}`, {
      method: "DELETE",
    }).catch(() => null);
    if (!res || !res.ok) {
      setError("レイアウトを削除できませんでした");
      return;
    }
    router.refresh();
  }

  // 書き出したJSONファイルを、新しいレイアウトとして取り込む (D-05)
  async function importFile(file: File) {
    setError(null);
    setImportNotice(null);
    if (file.size > MAX_IMPORT_BYTES) {
      setError("ファイルが大きすぎます(1MBまで)");
      return;
    }
    let layout: unknown;
    try {
      layout = JSON.parse(await file.text());
    } catch {
      setError("JSONとして読み取れませんでした。書き出したレイアウトのファイルを選んでください");
      return;
    }
    setPending(true);
    const r = await requestJson<{ layout: { id: string }; warnings: string[] }>(
      `/api/tournaments/${tournamentId}/layouts/import`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || undefined, layout }),
      }
    );
    setPending(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    if (r.data.warnings.length > 0) {
      // 警告があるときは自動で移動せず、内容を読んでから開けるようにする
      setImportNotice({ layoutId: r.data.layout.id, warnings: r.data.warnings });
      router.refresh();
      return;
    }
    router.push(`/tournaments/${tournamentId}/layouts/${r.data.layout.id}`);
  }

  function obsUrl(layoutId: string) {
    const roundId = obsRoundByLayout[layoutId];
    if (!roundId || typeof window === "undefined") return null;
    return `${window.location.origin}/obs/${layoutId}?round=${roundId}`;
  }

  async function copyObsUrl(layoutId: string) {
    const url = obsUrl(layoutId);
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopiedLayoutId(layoutId);
    window.setTimeout(() => setCopiedLayoutId(null), 1500);
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
        className="flex items-end gap-3 rounded-lg border border-border bg-surface p-5"
      >
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-sm font-medium text-body">新しいレイアウト名</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: Main / Scoreboard / Final / OBS"
            className="rounded-md border border-border-strong px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary-hover"
          />
        </div>
        <button
          type="submit"
          disabled={pending || !name}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          作成
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-5 py-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-body">JSONファイルから取り込む</p>
          <p className="text-xs text-muted">
            他の大会で書き出したレイアウトを、新しいレイアウトとして追加します(既存のレイアウトは変わりません)。
            上の「新しいレイアウト名」を入力しておくと、その名前で保存します。
          </p>
        </div>
        <label
          className={`cursor-pointer rounded-md border border-border-strong px-4 py-2 text-sm text-body transition hover:bg-canvas ${
            pending ? "pointer-events-none opacity-50" : ""
          }`}
        >
          ファイルを選択
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // 同じファイルをもう一度選べるようにする
              if (file) void importFile(file);
            }}
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {importNotice && (
        <div role="status" className="rounded-md border border-border-strong bg-canvas px-4 py-3 text-sm text-body">
          <p className="mb-1 font-medium">取り込みました。確認してほしい点があります。</p>
          <ul className="mb-2 list-disc pl-5 text-xs text-muted">
            {importNotice.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <Link
            href={`/tournaments/${tournamentId}/layouts/${importNotice.layoutId}`}
            className="text-xs font-medium text-primary hover:underline"
          >
            取り込んだレイアウトを開く
          </Link>
        </div>
      )}

      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {initialLayouts.length === 0 && (
          <li className="p-8 text-center text-sm text-muted">まだレイアウトがありません</li>
        )}
        {initialLayouts.map((layout) => (
          <li key={layout.id} className="flex flex-col gap-3 px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <Link
                  href={`/tournaments/${tournamentId}/layouts/${layout.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {layout.name}
                </Link>
                <p className="text-xs text-muted">
                  最終更新: {new Date(layout.updated_at).toLocaleString("ja-JP")}
                </p>
              </div>
              <div className="flex gap-2">
                <a
                  href={`/api/tournaments/${tournamentId}/layouts/${layout.id}/export`}
                  download
                  className="rounded-md border border-border-strong px-3 py-1.5 text-xs text-body hover:bg-canvas"
                >
                  書き出し
                </a>
                <button
                  onClick={() => create(layout.id)}
                  className="rounded-md border border-border-strong px-3 py-1.5 text-xs text-body hover:bg-canvas"
                >
                  複製
                </button>
                <button
                  onClick={() => remove(layout.id, layout.name)}
                  className="rounded-md border border-danger/30 px-3 py-1.5 text-xs text-danger hover:bg-danger-soft"
                >
                  削除
                </button>
              </div>
            </div>

            {rounds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-canvas p-3">
                <span className="text-xs text-muted">OBS Browser Source用URL:</span>
                <select
                  value={obsRoundByLayout[layout.id] ?? ""}
                  onChange={(e) =>
                    setObsRoundByLayout((prev) => ({ ...prev, [layout.id]: e.target.value }))
                  }
                  className="rounded-md border border-border-strong px-2 py-1 text-xs"
                >
                  <option value="">ラウンドを選択</option>
                  {rounds.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => copyObsUrl(layout.id)}
                  disabled={!obsRoundByLayout[layout.id]}
                  className="rounded-md border border-border-strong px-3 py-1 text-xs text-body hover:bg-surface disabled:opacity-50"
                >
                  {copiedLayoutId === layout.id ? "コピーしました" : "URLをコピー"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
