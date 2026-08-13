import { z } from "zod";

/**
 * zod schema mirroring src/lib/rules/types.ts RuleConfig. Kept in its own
 * module so both the rounds API routes and any future client-side form
 * validation can share the exact same shape.
 */
export const winConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SCORE_TARGET"), targetScore: z.number().int().positive() }),
  z.object({ type: z.literal("QUESTION_COUNT"), questionCount: z.number().int().positive() }),
  z.object({ type: z.literal("TIME_LIMIT"), timeLimitSeconds: z.number().int().positive() }),
  z.object({ type: z.literal("OPEN") }),
]);

export const ruleConfigSchema = z.object({
  correctPoints: z.number(),
  wrongPenalty: z.number(),
  throughPenalty: z.number(),
  maxWrongAnswers: z.number().int().positive().nullable(),
  disqualifyOnMaxWrong: z.boolean(),
  winCondition: winConditionSchema,
  placementPoints: z.record(z.coerce.number().int(), z.number()).nullable(),
});
