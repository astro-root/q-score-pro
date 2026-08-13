"use client";

import type { DisplayBlock, DisplayDataContext, DisplayLayoutData } from "@/lib/display/types";
import { resolveTemplate } from "@/lib/display/binding";
import { resolvePlayerIndex, topPlayers } from "@/lib/display/player-selector";

/**
 * Pure rendering of a DisplayLayoutData + DisplayDataContext into DOM. Used
 * by both the layout editor's live preview and (Phase 8) the public OBS
 * Browser Source route - the exact same component, so what an organizer
 * designs is exactly what streams. Never fetches data itself and never
 * calls any rules/scoring code directly - it only consumes the
 * DisplayDataContext it's given (master spec section 35: ルールと表示の分離).
 */
export function DisplayRenderer({
  layout,
  context,
  scale = 1,
  onBlockClick,
  selectedBlockId,
}: {
  layout: DisplayLayoutData;
  context: DisplayDataContext;
  scale?: number;
  onBlockClick?: (blockId: string) => void;
  selectedBlockId?: string | null;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: layout.canvas.width * scale,
        height: layout.canvas.height * scale,
        backgroundColor: layout.canvas.backgroundColor,
        backgroundImage: layout.canvas.backgroundImageUrl
          ? `url(${layout.canvas.backgroundImageUrl})`
          : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        overflow: "hidden",
      }}
    >
      {layout.blocks
        .filter((b) => b.visible)
        .map((block) => (
          <BlockRenderer
            key={block.id}
            block={block}
            context={context}
            scale={scale}
            selected={selectedBlockId === block.id}
            onClick={onBlockClick ? () => onBlockClick(block.id) : undefined}
          />
        ))}
    </div>
  );
}

function BlockRenderer({
  block,
  context,
  scale,
  selected,
  onClick,
}: {
  block: DisplayBlock;
  context: DisplayDataContext;
  scale: number;
  selected: boolean;
  onClick?: () => void;
}) {
  const wrapperStyle: React.CSSProperties = {
    position: "absolute",
    left: block.rect.x * scale,
    top: block.rect.y * scale,
    width: block.rect.width * scale,
    height: block.rect.height * scale,
    zIndex: block.rect.zIndex,
    backgroundColor: block.style.backgroundColor || undefined,
    color: block.style.textColor,
    fontSize: block.style.fontSize * scale,
    fontWeight: block.style.fontWeight,
    borderRadius: block.style.borderRadius * scale,
    border: block.style.borderWidth
      ? `${block.style.borderWidth * scale}px solid ${block.style.borderColor || "#000"}`
      : undefined,
    opacity: block.style.opacity,
    padding: block.style.padding * scale,
    textAlign: block.style.textAlign,
    boxSizing: "border-box",
    overflow: "hidden",
    outline: selected ? "2px solid #6366f1" : undefined,
    cursor: onClick ? "pointer" : undefined,
  };

  return (
    <div style={wrapperStyle} onClick={onClick}>
      <BlockContent block={block} context={context} />
    </div>
  );
}

function BlockContent({ block, context }: { block: DisplayBlock; context: DisplayDataContext }) {
  switch (block.type) {
    case "TEXT":
      return <span>{resolveTemplate(block.content, context)}</span>;

    case "IMAGE": {
      const src = resolveTemplate(block.content, context);
      return src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      ) : null;
    }

    case "SHAPE":
      return null; // the wrapper div's background/border already is the shape

    case "PLAYER_CARD": {
      const index = resolvePlayerIndex(block.playerSelector, context);
      const player = index !== null ? context.players[index] : null;
      const fields = block.playerFields ?? ["rank", "name", "score"];
      if (!player) return <span style={{ opacity: 0.5 }}>(未割当)</span>;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, height: "100%" }}>
          {fields.includes("rank") && <span style={{ fontSize: "0.6em" }}>{player.rank ?? "-"}位</span>}
          {fields.includes("name") && <span style={{ fontWeight: "bold" }}>{player.name}</span>}
          {fields.includes("score") && <span>{player.score}</span>}
          {fields.includes("correctCount") && (
            <span style={{ fontSize: "0.5em" }}>正解 {player.correctCount}</span>
          )}
          {fields.includes("wrongCount") && (
            <span style={{ fontSize: "0.5em" }}>誤答 {player.wrongCount}</span>
          )}
        </div>
      );
    }

    case "RANKING_LIST": {
      const players = topPlayers(context, block.listLimit ?? 5);
      return (
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {players.map((p) => (
            <li key={p.participantId} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>
                {p.rank ?? "-"}位 {p.name}
              </span>
              <span>{p.score}</span>
            </li>
          ))}
        </ol>
      );
    }

    case "SCOREBOARD": {
      const players = topPlayers(context, block.listLimit ?? 100);
      return (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.7em" }}>
          <tbody>
            {players.map((p) => (
              <tr key={p.participantId}>
                <td style={{ padding: "2px 6px" }}>{p.rank ?? "-"}</td>
                <td style={{ padding: "2px 6px" }}>{p.name}</td>
                <td style={{ padding: "2px 6px", textAlign: "right" }}>{p.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    default:
      return null;
  }
}
