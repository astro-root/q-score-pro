/**
 * Ranking + cutoff ("足切り") logic, kept as pure functions so it can be
 * unit-tested independently of Supabase/Next.js (master spec section 40:
 * 順位計算テスト).
 *
 * Ranking method: standard competition ranking ("1224" ranking) - tied
 * scores share the same rank, and the next distinct score's rank equals its
 * 1-indexed position in the sorted list (i.e. ranks are skipped after a
 * tie), not "1223" (dense ranking). This matches how most quiz tournaments
 * report results.
 */

export interface Scored {
  id: string;
  score: number;
}

export interface Ranked extends Scored {
  rank: number;
}

/**
 * Sorts by score descending and assigns competition ranks.
 * Ties receive the same rank; NaN/undefined scores are treated as 0 by the
 * caller (this function assumes valid numbers were already normalized).
 */
export function computeRanking(entries: Scored[]): Ranked[] {
  const sorted = [...entries].sort((a, b) => b.score - a.score);

  const ranked: Ranked[] = [];
  let previousScore: number | null = null;
  let previousRank = 0;

  sorted.forEach((entry, index) => {
    const position = index + 1; // 1-indexed
    const rank = entry.score === previousScore ? previousRank : position;
    ranked.push({ ...entry, rank });
    previousScore = entry.score;
    previousRank = rank;
  });

  return ranked;
}

/**
 * Determines who advances given a target headcount ("足切り"). If the
 * requested cutoff falls in the middle of a tie, every participant sharing
 * that boundary rank advances (fairness over strict headcount - nobody is
 * cut on a coin flip). This means the actual number of advancers can exceed
 * `advanceCount` when there are ties at the boundary, and this is
 * intentional, not a bug.
 *
 * Returns the same Ranked objects with `advanceCount` participants
 * (or more, on a boundary tie) flagged via the returned Set of ids.
 */
export function determineAdvancement(ranked: Ranked[], advanceCount: number): Set<string> {
  if (advanceCount <= 0) return new Set();
  if (ranked.length === 0) return new Set();

  const sorted = [...ranked].sort((a, b) => a.rank - b.rank);
  const boundaryIndex = Math.min(advanceCount, sorted.length) - 1;
  const boundaryRank = sorted[boundaryIndex].rank;

  return new Set(sorted.filter((r) => r.rank <= boundaryRank).map((r) => r.id));
}
