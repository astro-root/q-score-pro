import type { DisplayDataContext, PlayerSelector } from "./types";

/**
 * Resolves a PlayerSelector to a concrete index into ctx.players, or null
 * if nothing matches (e.g. RANK 5 when only 4 players exist, or a pinned
 * PARTICIPANT id no longer in the round). Kept separate from the React
 * layer so it's directly unit-testable.
 */
export function resolvePlayerIndex(
  selector: PlayerSelector | undefined,
  ctx: DisplayDataContext
): number | null {
  if (!selector) return null;

  if (selector.mode === "PARTICIPANT") {
    const index = ctx.players.findIndex((p) => p.participantId === selector.participantId);
    return index === -1 ? null : index;
  }

  // RANK mode: find the player whose rank equals selector.rank. Ties share
  // a rank (see src/lib/scoring/ranking.ts), so this returns the first
  // player at that rank in list order - callers displaying "1位" during a
  // tie will want a RANKING_LIST block instead, which shows all of them.
  const index = ctx.players.findIndex((p) => p.rank === selector.rank);
  return index === -1 ? null : index;
}

/** Top N players by rank, ties included in list order, for RANKING_LIST/SCOREBOARD blocks. */
export function topPlayers(ctx: DisplayDataContext, limit: number): DisplayDataContext["players"] {
  return [...ctx.players]
    .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER))
    .slice(0, limit);
}
