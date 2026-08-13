"use client";

import type { Database } from "@/types/database";
import type { DisplayBlock, PlayerCardField } from "@/lib/display/types";
import { AVAILABLE_TOKENS } from "@/lib/display/binding";

type Participant = Database["public"]["Tables"]["participants"]["Row"];

const FIELD_LABEL: Record<PlayerCardField, string> = {
  rank: "順位",
  name: "名前",
  score: "得点",
  correctCount: "正解数",
  wrongCount: "誤答数",
};

export function BlockPropertyPanel({
  block,
  participants,
  onChange,
  onDelete,
}: {
  block: DisplayBlock;
  participants: Participant[];
  onChange: (next: DisplayBlock) => void;
  onDelete: () => void;
}) {
  const inputClass =
    "w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  return (
    <div className="flex flex-col gap-4 text-slate-200">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">ブロック設定</h3>
        <button onClick={onDelete} className="text-xs text-red-400 hover:underline">
          削除
        </button>
      </div>

      {block.type === "TEXT" && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">テキスト(テンプレート)</label>
          <textarea
            value={block.content}
            onChange={(e) => onChange({ ...block, content: e.target.value })}
            rows={3}
            className={inputClass}
          />
          <p className="text-[10px] text-slate-500">
            使用可能トークン: {AVAILABLE_TOKENS.join(", ")}
          </p>
        </div>
      )}

      {block.type === "IMAGE" && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">画像URL(またはトークン)</label>
          <input
            value={block.content}
            onChange={(e) => onChange({ ...block, content: e.target.value })}
            className={inputClass}
          />
        </div>
      )}

      {block.type === "PLAYER_CARD" && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">表示する参加者</label>
            <select
              value={block.playerSelector?.mode === "PARTICIPANT" ? "PARTICIPANT" : "RANK"}
              onChange={(e) =>
                onChange({
                  ...block,
                  playerSelector:
                    e.target.value === "PARTICIPANT"
                      ? { mode: "PARTICIPANT", participantId: participants[0]?.id ?? "" }
                      : { mode: "RANK", rank: 1 },
                })
              }
              className={inputClass}
            >
              <option value="RANK">順位で指定</option>
              <option value="PARTICIPANT">参加者を直接指定</option>
            </select>
          </div>
          {block.playerSelector?.mode === "RANK" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">順位</label>
              <input
                type="number"
                min={1}
                value={block.playerSelector.rank}
                onChange={(e) =>
                  onChange({ ...block, playerSelector: { mode: "RANK", rank: Number(e.target.value) } })
                }
                className={inputClass}
              />
            </div>
          )}
          {block.playerSelector?.mode === "PARTICIPANT" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">参加者</label>
              <select
                value={block.playerSelector.participantId}
                onChange={(e) =>
                  onChange({
                    ...block,
                    playerSelector: { mode: "PARTICIPANT", participantId: e.target.value },
                  })
                }
                className={inputClass}
              >
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">表示項目</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(FIELD_LABEL) as PlayerCardField[]).map((f) => (
                <label key={f} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={(block.playerFields ?? []).includes(f)}
                    onChange={(e) => {
                      const current = block.playerFields ?? [];
                      onChange({
                        ...block,
                        playerFields: e.target.checked
                          ? [...current, f]
                          : current.filter((x) => x !== f),
                      });
                    }}
                  />
                  {FIELD_LABEL[f]}
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      {(block.type === "RANKING_LIST" || block.type === "SCOREBOARD") && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">表示件数</label>
          <input
            type="number"
            min={1}
            value={block.listLimit ?? 5}
            onChange={(e) => onChange({ ...block, listLimit: Number(e.target.value) })}
            className={inputClass}
          />
        </div>
      )}

      <hr className="border-slate-700" />

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">X</label>
          <input
            type="number"
            value={block.rect.x}
            onChange={(e) => onChange({ ...block, rect: { ...block.rect, x: Number(e.target.value) } })}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">Y</label>
          <input
            type="number"
            value={block.rect.y}
            onChange={(e) => onChange({ ...block, rect: { ...block.rect, y: Number(e.target.value) } })}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">幅</label>
          <input
            type="number"
            value={block.rect.width}
            onChange={(e) =>
              onChange({ ...block, rect: { ...block.rect, width: Number(e.target.value) } })
            }
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">高さ</label>
          <input
            type="number"
            value={block.rect.height}
            onChange={(e) =>
              onChange({ ...block, rect: { ...block.rect, height: Number(e.target.value) } })
            }
            className={inputClass}
          />
        </div>
      </div>

      <hr className="border-slate-700" />

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">背景色</label>
          <input
            type="color"
            value={block.style.backgroundColor || "#000000"}
            onChange={(e) => onChange({ ...block, style: { ...block.style, backgroundColor: e.target.value } })}
            className="h-8 w-full rounded"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">文字色</label>
          <input
            type="color"
            value={block.style.textColor}
            onChange={(e) => onChange({ ...block, style: { ...block.style, textColor: e.target.value } })}
            className="h-8 w-full rounded"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">文字サイズ</label>
          <input
            type="number"
            value={block.style.fontSize}
            onChange={(e) =>
              onChange({ ...block, style: { ...block.style, fontSize: Number(e.target.value) } })
            }
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">太さ</label>
          <select
            value={block.style.fontWeight}
            onChange={(e) =>
              onChange({ ...block, style: { ...block.style, fontWeight: e.target.value as "normal" | "bold" } })
            }
            className={inputClass}
          >
            <option value="normal">通常</option>
            <option value="bold">太字</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">角丸</label>
          <input
            type="number"
            value={block.style.borderRadius}
            onChange={(e) =>
              onChange({ ...block, style: { ...block.style, borderRadius: Number(e.target.value) } })
            }
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">不透明度</label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.1}
            value={block.style.opacity}
            onChange={(e) => onChange({ ...block, style: { ...block.style, opacity: Number(e.target.value) } })}
            className={inputClass}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={block.visible}
          onChange={(e) => onChange({ ...block, visible: e.target.checked })}
        />
        表示する
      </label>
    </div>
  );
}
