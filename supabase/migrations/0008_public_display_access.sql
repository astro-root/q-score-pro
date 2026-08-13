-- =============================================================================
-- Q-Score Pro : Phase 8 schema
-- OBS Browser Source / public realtime display
--
-- Design notes:
-- - The whole point of a "配信画面" is that its content (scores, ranks,
--   player names, round progress) is meant to be shown publicly on a
--   projector/stream. So, mirroring the pattern already established for
--   `tournaments`/`announcements`/`schedule_items` in Phase 2 (public once
--   the tournament is out of DRAFT), this migration adds narrow, read-only
--   public SELECT policies on `rounds`, `round_participants`,
--   `participants`, and `display_layouts` - gated by the same "tournament
--   is not DRAFT" condition. DRAFT tournaments remain fully staff-only;
--   nothing about a tournament still being prepared leaks.
-- - This is what makes genuine Supabase Realtime subscriptions from an
--   unauthenticated OBS Browser Source possible (see
--   src/app/obs/[layoutId]/obs-display.tsx) rather than polling: Realtime
--   postgres_changes payloads are filtered by the same RLS policies as a
--   normal SELECT, so opening these specific, non-sensitive columns to
--   anon is both correct and sufficient - it does not touch entries,
--   audit_logs, score_events, or staff/tournament_members visibility,
--   which all remain staff-only exactly as before.
-- =============================================================================

create policy "rounds_select_public"
  on public.rounds for select
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.status <> 'DRAFT'
    )
  );

create policy "round_participants_select_public"
  on public.round_participants for select
  using (
    exists (
      select 1 from public.rounds r
      join public.tournaments t on t.id = r.tournament_id
      where r.id = round_id
        and t.status <> 'DRAFT'
    )
  );

create policy "participants_select_public"
  on public.participants for select
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.status <> 'DRAFT'
    )
  );

create policy "display_layouts_select_public"
  on public.display_layouts for select
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.status <> 'DRAFT'
    )
  );
