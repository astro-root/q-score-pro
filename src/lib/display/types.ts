/**
 * Custom display engine types (master spec section 18-24).
 *
 * A DisplayLayout is a flat list of DisplayBlocks with free-form position/
 * size (block-based, drag-and-drop editable). Blocks bind to live
 * tournament data via {{token}} templates resolved by resolveTemplate()
 * (see binding.ts) - never via eval or a real templating engine, so binding
 * is safe by construction (a malicious/typo'd token just renders literally
 * or blank, it can never execute code).
 *
 * Rules/scoring (src/lib/rules, src/lib/scoring) and display are
 * deliberately independent modules - this file never imports from them,
 * it only describes the shape of DATA that a renderer consumes (master
 * spec section 35: ルールと表示の分離).
 */

export type BlockType = "TEXT" | "IMAGE" | "SHAPE" | "PLAYER_CARD" | "RANKING_LIST" | "SCOREBOARD";

export interface BlockStyle {
  backgroundColor: string; // css color, '' = transparent
  textColor: string;
  fontSize: number; // px
  fontWeight: "normal" | "bold";
  borderRadius: number; // px
  borderColor: string; // '' = none
  borderWidth: number; // px
  opacity: number; // 0-1
  padding: number; // px
  textAlign: "left" | "center" | "right";
}

export const DEFAULT_BLOCK_STYLE: BlockStyle = {
  backgroundColor: "",
  textColor: "#0f172a",
  fontSize: 24,
  fontWeight: "normal",
  borderRadius: 8,
  borderColor: "",
  borderWidth: 0,
  opacity: 1,
  padding: 12,
  textAlign: "left",
};

export interface BlockRect {
  x: number; // px, relative to canvas
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export type PlayerCardField = "rank" | "name" | "score" | "correctCount" | "wrongCount";

/** How a PLAYER_CARD or list-like block picks which participant(s) to show. */
export type PlayerSelector =
  | { mode: "RANK"; rank: number } // Nth place by current rank
  | { mode: "PARTICIPANT"; participantId: string }; // a specific, pinned participant

export interface DisplayBlock {
  id: string;
  type: BlockType;
  rect: BlockRect;
  style: BlockStyle;
  visible: boolean;
  // TEXT: template string, e.g. "{{tournament.name}} - 第{{round.questionNumber}}問"
  // IMAGE: raw URL or a single {{token}} that resolves to a URL
  content: string;
  // PLAYER_CARD only
  playerSelector?: PlayerSelector;
  playerFields?: PlayerCardField[];
  // RANKING_LIST / SCOREBOARD only
  listLimit?: number;
}

export interface DisplayCanvas {
  width: number;
  height: number;
  backgroundColor: string;
  backgroundImageUrl: string;
}

export const DEFAULT_CANVAS: DisplayCanvas = {
  width: 1920,
  height: 1080,
  backgroundColor: "#0f172a",
  backgroundImageUrl: "",
};

export interface DisplayLayoutData {
  canvas: DisplayCanvas;
  blocks: DisplayBlock[];
}

export const EMPTY_LAYOUT: DisplayLayoutData = {
  canvas: DEFAULT_CANVAS,
  blocks: [],
};

/**
 * The live data a layout's bindings resolve against. Assembled by the
 * server (or the editor, using either real or sample data) from Phase 1-6
 * tables - this type is the ONLY contract between "display" and
 * "everything else", keeping the two sides swappable independently.
 */
export interface DisplayDataContext {
  tournament: { name: string; logoUrl: string | null };
  round: { name: string; questionNumber: number; status: string };
  players: {
    participantId: string;
    name: string;
    rank: number | null;
    score: number;
    correctCount: number;
    wrongCount: number;
  }[];
}
