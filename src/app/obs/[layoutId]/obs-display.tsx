"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DisplayRenderer } from "@/components/display/DisplayRenderer";
import type { DisplayDataContext, DisplayLayoutData } from "@/lib/display/types";

/**
 * Renders a saved layout against a specific round's live data, with no
 * navigation, buttons, or admin chrome - a finished broadcast graphic
 * (master spec section 26: OBS用の画面は管理画面とは完全に分離). Subscribes
 * to Supabase Realtime directly with the anon key; this works because
 * migration 0008 opens narrow, read-only public SELECT policies on
 * rounds/round_participants/participants once a tournament is out of
 * DRAFT - the same RLS that gates a normal SELECT also gates what this
 * anonymous realtime subscription can see.
 */
export function ObsDisplay({
  layout,
  roundId,
  initialContext,
}: {
  layout: DisplayLayoutData;
  roundId: string;
  initialContext: DisplayDataContext;
}) {
  const [context, setContext] = useState(initialContext);
  const supabaseRef = useRef(createClient());

  const refetch = useCallback(async () => {
    const supabase = supabaseRef.current;

    const { data: round } = await supabase
      .from("rounds")
      .select("name, status, current_question_number")
      .eq("id", roundId)
      .maybeSingle();
    if (!round) return;

    const { data: roundParticipants } = await supabase
      .from("round_participants")
      .select("participant_id, score, rank, correct_count, wrong_count, participants ( display_name )")
      .eq("round_id", roundId);

    setContext((prev) => ({
      ...prev,
      round: {
        name: round.name,
        questionNumber: round.current_question_number,
        status: round.status,
      },
      players: (roundParticipants ?? []).map((rp) => ({
        participantId: rp.participant_id,
        name: (rp.participants as unknown as { display_name: string } | null)?.display_name ?? "-",
        rank: rp.rank,
        score: rp.score ?? 0,
        correctCount: rp.correct_count,
        wrongCount: rp.wrong_count,
      })),
    }));
  }, [roundId]);

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`obs-${roundId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "round_participants", filter: `round_id=eq.${roundId}` },
        () => refetch()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rounds", filter: `id=eq.${roundId}` },
        () => refetch()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roundId, refetch]);

  return (
    <div style={{ margin: 0, padding: 0, background: "transparent" }}>
      <DisplayRenderer layout={layout} context={context} scale={1} />
    </div>
  );
}
