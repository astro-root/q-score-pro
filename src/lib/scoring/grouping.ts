/**
 * Auto-grouping ("自動組分け") logic as pure functions (master spec section
 * 14 and section 40: 組分けテスト).
 *
 * Input is always assumed to already be in the desired seeding order
 * (typically: ranked by a previous round's results, best first) - that is
 * how "シード考慮" is satisfied: callers sort by rank/seed before calling.
 */

export type GroupAssignment = Record<string, string>; // participantId -> group label ("A", "B", ...)

function groupLabels(count: number): string[] {
  return Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));
}

/**
 * "上位から均等配分" - snake/serpentine draft distribution. Distributes
 * strength evenly across groups: 1st seed -> A, 2nd -> B, ... Nth -> last
 * group, then reverses direction for the next pass (N+1th -> last group
 * again, ...). This is the standard way to keep groups balanced in overall
 * strength when participants are pre-ranked.
 */
export function assignGroupsSnake(orderedIds: string[], groupCount: number): GroupAssignment {
  if (groupCount <= 0) throw new Error("groupCount must be positive");
  const labels = groupLabels(groupCount);
  const assignment: GroupAssignment = {};

  let cursor = 0;
  let direction: 1 | -1 = 1;

  for (const id of orderedIds) {
    assignment[id] = labels[cursor];
    if (direction === 1) {
      if (cursor === groupCount - 1) direction = -1;
      else cursor += 1;
    } else {
      if (cursor === 0) direction = 1;
      else cursor -= 1;
    }
  }

  return assignment;
}

/**
 * "人数均等" (simple round-robin, no strength balancing) - fills groups in
 * order A, B, C, ..., A, B, C, ... without reversing. Headcount ends up
 * balanced (±1) but does NOT balance overall strength the way the snake
 * distribution does; use this when the tournament doesn't care about
 * cross-group strength parity, only equal headcount.
 */
export function assignGroupsRoundRobin(orderedIds: string[], groupCount: number): GroupAssignment {
  if (groupCount <= 0) throw new Error("groupCount must be positive");
  const labels = groupLabels(groupCount);
  const assignment: GroupAssignment = {};

  orderedIds.forEach((id, index) => {
    assignment[id] = labels[index % groupCount];
  });

  return assignment;
}

/**
 * "上位グループ丸ごと" (contiguous blocks) - the top ceil(n/groupCount)
 * ranked participants all go to group A, the next block to group B, etc.
 * Unlike the snake distribution, this does NOT balance strength across
 * groups (group A is always the strongest) - useful when the tournament
 * format wants exactly that (e.g. seeded bracket blocks).
 */
export function assignGroupsSequentialBlocks(
  orderedIds: string[],
  groupCount: number
): GroupAssignment {
  if (groupCount <= 0) throw new Error("groupCount must be positive");
  const labels = groupLabels(groupCount);
  const assignment: GroupAssignment = {};
  const blockSize = Math.ceil(orderedIds.length / groupCount);

  orderedIds.forEach((id, index) => {
    const groupIndex = Math.min(Math.floor(index / blockSize), groupCount - 1);
    assignment[id] = labels[groupIndex];
  });

  return assignment;
}

/**
 * "特定参加者の分離" - post-processes an assignment so that no two ids
 * within the same `separate` set end up in the same group, if avoidable.
 * Works by swapping the later-appearing conflicting id with a participant
 * from a different group who isn't part of any separation constraint,
 * preserving overall group sizes exactly. Mutates a shallow copy; the
 * `orderedIds` order is used to decide which id is "later" (lower seed
 * priority) when a conflict must be resolved.
 *
 * This is a best-effort resolver, not a solver: with enough separation
 * constraints and few groups, some conflicts may be structurally
 * unavoidable (e.g. 3 people who must all be separated but only 2 groups
 * exist). Those residual conflicts are returned so the caller/staff can
 * resolve them manually (master spec section 14: 手動修正).
 */
export function applySeparationConstraints(
  orderedIds: string[],
  assignment: GroupAssignment,
  separate: string[][]
): { assignment: GroupAssignment; unresolved: string[][] } {
  const result: GroupAssignment = { ...assignment };
  const unresolved: string[][] = [];

  for (const group of separate) {
    const relevant = group.filter((id) => id in result);
    if (relevant.length < 2) continue;

    // Process in the tournament's seed order so the strongest participant
    // in the constraint group keeps their original slot; later ones move.
    const bySeed = [...relevant].sort((a, b) => orderedIds.indexOf(a) - orderedIds.indexOf(b));

    for (let i = 1; i < bySeed.length; i++) {
      const currentId = bySeed[i];
      const occupiedGroups = new Set(bySeed.slice(0, i).map((id) => result[id]));
      if (!occupiedGroups.has(result[currentId])) continue; // already fine

      // Find a swap partner: someone in a different, unoccupied group who
      // is not themselves part of any separation constraint we've already
      // placed, to avoid cascading violations.
      const candidateIds = Object.keys(result).filter(
        (id) => id !== currentId && !occupiedGroups.has(result[id]) && !group.includes(id)
      );

      if (candidateIds.length === 0) {
        unresolved.push(group);
        continue;
      }

      const swapWith = candidateIds[0];
      const tmp = result[currentId];
      result[currentId] = result[swapWith];
      result[swapWith] = tmp;
    }
  }

  return { assignment: result, unresolved };
}
