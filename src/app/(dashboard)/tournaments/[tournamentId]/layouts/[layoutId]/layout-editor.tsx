"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Database } from "@/types/database";
import type { BlockType, DisplayDataContext, DisplayLayoutData } from "@/lib/display/types";
import { DisplayRenderer } from "@/components/display/DisplayRenderer";
import { createDefaultBlock } from "./create-default-block";
import { BlockPropertyPanel } from "./block-property-panel";

type Participant = Database["public"]["Tables"]["participants"]["Row"];
type Round = Pick<Database["public"]["Tables"]["rounds"]["Row"], "id" | "name">;

const BLOCK_PALETTE: { type: BlockType; label: string }[] = [
  { type: "TEXT", label: "テキスト" },
  { type: "IMAGE", label: "画像" },
  { type: "SHAPE", label: "図形" },
  { type: "PLAYER_CARD", label: "プレイヤーカード" },
  { type: "RANKING_LIST", label: "ランキング" },
  { type: "SCOREBOARD", label: "スコアボード" },
];

const SAMPLE_CONTEXT: DisplayDataContext = {
  tournament: { name: "サンプル大会", logoUrl: null },
  round: { name: "決勝", questionNumber: 3, status: "RUNNING" },
  players: [
    { participantId: "sample-1", name: "山田太郎", rank: 1, score: 30, correctCount: 3, wrongCount: 0 },
    { participantId: "sample-2", name: "鈴木花子", rank: 2, score: 20, correctCount: 2, wrongCount: 1 },
  ],
};

const PREVIEW_WIDTH = 900;

export function LayoutEditor({
  tournamentId,
  layoutId,
  initialName,
  initialData,
  rounds,
  participants,
}: {
  tournamentId: string;
  layoutId: string;
  initialName: string;
  initialData: DisplayLayoutData;
  rounds: Round[];
  participants: Participant[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [data, setData] = useState(initialData);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [previewRoundId, setPreviewRoundId] = useState<string>(rounds[0]?.id ?? "");
  const [previewContext, setPreviewContext] = useState<DisplayDataContext>(SAMPLE_CONTEXT);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    blockId: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    startRect: { x: number; y: number; width: number; height: number };
  } | null>(null);

  const scale = PREVIEW_WIDTH / data.canvas.width;

  useEffect(() => {
    if (!previewRoundId) return;
    fetch(`/api/tournaments/${tournamentId}/rounds/${previewRoundId}/display-context`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body?.context) setPreviewContext(body.context);
      });
  }, [tournamentId, previewRoundId]);

  const selectedBlock = data.blocks.find((b) => b.id === selectedBlockId) ?? null;

  function updateBlock(next: typeof selectedBlock) {
    if (!next) return;
    setData((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === next.id ? next : b)) }));
  }

  function addBlock(type: BlockType) {
    const maxZ = data.blocks.reduce((m, b) => Math.max(m, b.rect.zIndex), 0);
    const block = createDefaultBlock(type, maxZ + 1);
    setData((d) => ({ ...d, blocks: [...d.blocks, block] }));
    setSelectedBlockId(block.id);
  }

  function deleteSelected() {
    if (!selectedBlockId) return;
    setData((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== selectedBlockId) }));
    setSelectedBlockId(null);
  }

  const onPointerDown = useCallback(
    (blockId: string, mode: "move" | "resize") => (e: React.PointerEvent) => {
      e.stopPropagation();
      const block = data.blocks.find((b) => b.id === blockId);
      if (!block) return;
      setSelectedBlockId(blockId);
      dragState.current = {
        blockId,
        mode,
        startX: e.clientX,
        startY: e.clientY,
        startRect: { ...block.rect },
      };
    },
    [data.blocks]
  );

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const drag = dragState.current;
      if (!drag) return;
      const dx = (e.clientX - drag.startX) / scale;
      const dy = (e.clientY - drag.startY) / scale;

      setData((d) => ({
        ...d,
        blocks: d.blocks.map((b) => {
          if (b.id !== drag.blockId) return b;
          if (drag.mode === "move") {
            return {
              ...b,
              rect: {
                ...b.rect,
                x: Math.max(0, Math.round(drag.startRect.x + dx)),
                y: Math.max(0, Math.round(drag.startRect.y + dy)),
              },
            };
          }
          return {
            ...b,
            rect: {
              ...b.rect,
              width: Math.max(20, Math.round(drag.startRect.width + dx)),
              height: Math.max(20, Math.round(drag.startRect.height + dy)),
            },
          };
        }),
      }));
    }
    function onUp() {
      dragState.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [scale]);

  async function save() {
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/layouts/${layoutId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, data }),
    });
    setSaving(false);
    if (!res.ok) {
      setMessage("保存に失敗しました");
      return;
    }
    setMessage("保存しました");
    router.refresh();
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name || "layout"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        setData(parsed);
        setMessage("インポートしました(保存ボタンで確定してください)");
      } catch {
        setMessage("JSONの読み込みに失敗しました");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm"
          />
          <select
            value={previewRoundId}
            onChange={(e) => {
              setPreviewRoundId(e.target.value);
              if (!e.target.value) setPreviewContext(SAMPLE_CONTEXT);
            }}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm"
          >
            <option value="">サンプルデータでプレビュー</option>
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}のデータでプレビュー
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          {message && <span className="text-xs text-emerald-400">{message}</span>}
          <label className="cursor-pointer rounded-md border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-800">
            インポート
            <input type="file" accept="application/json" onChange={importJson} className="hidden" />
          </label>
          <button
            onClick={exportJson}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-800"
          >
            エクスポート
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-48 shrink-0 overflow-y-auto border-r border-slate-800 p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">ブロックを追加</h3>
          <div className="flex flex-col gap-2">
            {BLOCK_PALETTE.map((item) => (
              <button
                key={item.type}
                onClick={() => addBlock(item.type)}
                className="rounded-md border border-slate-700 px-3 py-2 text-left text-sm hover:bg-slate-800"
              >
                + {item.label}
              </button>
            ))}
          </div>

          <h3 className="mt-6 mb-2 text-xs font-semibold uppercase text-slate-500">レイヤー</h3>
          <ul className="flex flex-col gap-1">
            {[...data.blocks]
              .sort((a, b) => b.rect.zIndex - a.rect.zIndex)
              .map((b) => (
                <li key={b.id}>
                  <button
                    onClick={() => setSelectedBlockId(b.id)}
                    className={`w-full truncate rounded px-2 py-1 text-left text-xs ${
                      selectedBlockId === b.id ? "bg-indigo-900 text-indigo-200" : "hover:bg-slate-800"
                    }`}
                  >
                    {b.type} {!b.visible && "(非表示)"}
                  </button>
                </li>
              ))}
          </ul>
        </aside>

        <main className="flex flex-1 items-center justify-center overflow-auto bg-slate-900 p-8">
          <div
            ref={canvasRef}
            onClick={() => setSelectedBlockId(null)}
            style={{ width: PREVIEW_WIDTH, height: data.canvas.height * scale }}
            className="relative shadow-2xl"
          >
            <DisplayRenderer layout={data} context={previewContext} scale={scale} />
            {/* Interaction overlay: invisible draggable/resizable handles positioned over each block */}
            {data.blocks.map((b) => (
              <div
                key={b.id}
                onPointerDown={onPointerDown(b.id, "move")}
                style={{
                  position: "absolute",
                  left: b.rect.x * scale,
                  top: b.rect.y * scale,
                  width: b.rect.width * scale,
                  height: b.rect.height * scale,
                  cursor: "move",
                  outline: selectedBlockId === b.id ? "2px dashed #818cf8" : undefined,
                }}
              >
                {selectedBlockId === b.id && (
                  <div
                    onPointerDown={onPointerDown(b.id, "resize")}
                    style={{
                      position: "absolute",
                      right: -6,
                      bottom: -6,
                      width: 12,
                      height: 12,
                      background: "#818cf8",
                      borderRadius: 3,
                      cursor: "nwse-resize",
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </main>

        <aside className="w-72 shrink-0 overflow-y-auto border-l border-slate-800 p-4">
          {selectedBlock ? (
            <BlockPropertyPanel
              block={selectedBlock}
              participants={participants}
              onChange={updateBlock}
              onDelete={deleteSelected}
            />
          ) : (
            <p className="text-sm text-slate-500">ブロックを選択すると設定を編集できます。</p>
          )}
        </aside>
      </div>
    </div>
  );
}
