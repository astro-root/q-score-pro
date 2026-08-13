/**
 * Resolves {{token}} placeholders against a DisplayDataContext. This is
 * intentionally NOT a general templating engine - no expressions, no
 * function calls, no eval. `resolveTemplate` only does whitelisted
 * dotted-path lookups (see TOKEN_RESOLVERS below), so an organizer typing
 * an arbitrary or malformed token can never do anything worse than see the
 * token printed back verbatim or a blank string. This is what section 21
 * of the master spec means by "実装上より安全・保守しやすい方法があれば
 * 変更してください" - a lookup table is safer than a template-string eval.
 */
import type { DisplayDataContext } from "./types";

const TOKEN_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

type TokenResolver = (ctx: DisplayDataContext, playerIndex?: number) => string;

const TOKEN_RESOLVERS: Record<string, TokenResolver> = {
  "tournament.name": (ctx) => ctx.tournament.name,
  "tournament.logoUrl": (ctx) => ctx.tournament.logoUrl ?? "",
  "round.name": (ctx) => ctx.round.name,
  "round.questionNumber": (ctx) => String(ctx.round.questionNumber),
  "round.status": (ctx) => ctx.round.status,
  "player.name": (ctx, i) => (i !== undefined ? (ctx.players[i]?.name ?? "") : ""),
  "player.score": (ctx, i) => (i !== undefined ? String(ctx.players[i]?.score ?? "") : ""),
  "player.rank": (ctx, i) => (i !== undefined ? String(ctx.players[i]?.rank ?? "") : ""),
  "player.correctCount": (ctx, i) =>
    i !== undefined ? String(ctx.players[i]?.correctCount ?? "") : "",
  "player.wrongCount": (ctx, i) => (i !== undefined ? String(ctx.players[i]?.wrongCount ?? "") : ""),
};

export const AVAILABLE_TOKENS = Object.keys(TOKEN_RESOLVERS);

/**
 * Resolves every {{token}} in `template`. `playerIndex` supplies the
 * `{{player.*}}` family when rendering inside a per-player block (e.g. a
 * PLAYER_CARD); omit it for tournament/round-level text. Unknown tokens are
 * left in place verbatim - visible-but-harmless is a better failure mode
 * for a live broadcast screen than throwing or silently vanishing text.
 */
export function resolveTemplate(
  template: string,
  ctx: DisplayDataContext,
  playerIndex?: number
): string {
  return template.replace(TOKEN_PATTERN, (match, token: string) => {
    const resolver = TOKEN_RESOLVERS[token];
    if (!resolver) return match;
    return resolver(ctx, playerIndex);
  });
}
