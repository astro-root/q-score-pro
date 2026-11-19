import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { PaperParticipantRow } from "./csv-rows";
import type { PaperAnswer, PaperQuestion, RankedParticipant } from "./scoring";

type Client = SupabaseClient<Database>;

/** PostgREST は1回あたり既定1000行まで。参加者×設問は超えうるのでページングする。 */
const PAGE = 1000;

async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) return all;
  }
}

export interface PaperRoundData {
  round: { id: string; name: string; advanceCount: number | null; roundType: "PAPER" | "BUZZER" };
  participants: PaperParticipantRow[];
  /** DB に保存されている確定値(手入力の点数を含む)。順位 / 通過 / 正誤数はここから。 */
  ranked: RankedParticipant[];
  questions: PaperQuestion[];
  answers: PaperAnswer[];
}

/** ラウンドが存在しない(または別大会の)場合は null。DBエラーは例外。 */
export async function loadPaperRound(
  supabase: Client,
  tournamentId: string,
  roundId: string
): Promise<PaperRoundData | null> {
  const { data: round, error: roundError } = await supabase
    .from("rounds")
    .select("id, name, advance_count, round_type")
    .eq("id", roundId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (roundError) throw new Error(roundError.message);
  if (!round) return null;

  const [rps, questionRows, answerRows] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("round_participants")
        .select(
          "participant_id, score, rank, passed, correct_count, wrong_count, plate_color, participants ( display_name, affiliation )"
        )
        .eq("round_id", roundId)
        .order("participant_id", { ascending: true })
        .range(from, to)
    ),
    fetchAll((from, to) =>
      supabase
        .from("paper_questions")
        .select("id, number, points, label")
        .eq("round_id", roundId)
        .order("number", { ascending: true })
        .range(from, to)
    ),
    fetchAll((from, to) =>
      supabase
        .from("paper_answers")
        .select("participant_id, question_id, is_correct")
        .eq("round_id", roundId)
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);

  const questions: PaperQuestion[] = questionRows.map((q) => ({
    id: q.id,
    number: q.number,
    points: Number(q.points),
    label: q.label,
  }));
  const answers: PaperAnswer[] = answerRows.map((a) => ({
    participantId: a.participant_id,
    questionId: a.question_id,
    isCorrect: a.is_correct,
  }));

  const participants: PaperParticipantRow[] = rps.map((rp) => ({
    participantId: rp.participant_id,
    displayName: rp.participants?.display_name ?? "-",
    affiliation: rp.participants?.affiliation ?? null,
    plateColor: rp.plate_color,
  }));

  const ranked: RankedParticipant[] = rps.map((rp) => {
    const graded = rp.correct_count + rp.wrong_count;
    return {
      participantId: rp.participant_id,
      graded,
      correct: rp.correct_count,
      wrong: rp.wrong_count,
      ungraded: Math.max(questions.length - graded, 0),
      score: rp.score === null ? null : Number(rp.score),
      rank: rp.rank,
      passed: rp.passed,
    };
  });

  return {
    round: {
      id: round.id,
      name: round.name,
      advanceCount: round.advance_count,
      roundType: round.round_type,
    },
    participants,
    ranked,
    questions,
    answers,
  };
}
