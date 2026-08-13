import { DEFAULT_BLOCK_STYLE, type BlockType, type DisplayBlock } from "@/lib/display/types";

let counter = 0;
function nextId() {
  counter += 1;
  return `block-${Date.now()}-${counter}`;
}

const DEFAULT_CONTENT: Record<BlockType, string> = {
  TEXT: "{{tournament.name}}",
  IMAGE: "{{tournament.logoUrl}}",
  SHAPE: "",
  PLAYER_CARD: "",
  RANKING_LIST: "",
  SCOREBOARD: "",
};

export function createDefaultBlock(type: BlockType, zIndex: number): DisplayBlock {
  return {
    id: nextId(),
    type,
    rect: { x: 80, y: 80, width: type === "TEXT" ? 400 : 320, height: type === "TEXT" ? 80 : 200, zIndex },
    style: { ...DEFAULT_BLOCK_STYLE },
    visible: true,
    content: DEFAULT_CONTENT[type],
    ...(type === "PLAYER_CARD" && {
      playerSelector: { mode: "RANK", rank: 1 },
      playerFields: ["rank", "name", "score"],
    }),
    ...(type === "RANKING_LIST" && { listLimit: 5 }),
    ...(type === "SCOREBOARD" && { listLimit: 20 }),
  };
}
