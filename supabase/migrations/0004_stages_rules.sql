-- =============================================================================
-- Q-Score Pro : Phase 4 schema
-- Stages / Rule engine configuration
--
-- Design notes:
-- - `stages` groups rounds under a named phase of the tournament (予選,
--   敗者復活, 本戦, 準決勝, 決勝, ...). Section 12 of the master spec asks
--   for arbitrary structures, including branching ones (予選 → 敗者復活 →
--   本戦 → ...). Rather than model an advancement graph explicitly, Q-Score
--   Pro keeps `stages`/`rounds` as flat, ordered lists (sort_order) and
--   lets staff freely attach whichever participants they want to whichever
--   round via round_participants (already true since Phase 3) - this is
--   deliberately more flexible than a fixed graph: a "敗者復活" stage is
--   just another stage whose rounds happen to be populated from the
--   participants who did NOT pass an earlier round, decided by staff (or,
--   later, by a saved query) rather than hardcoded into the schema.
-- - `rounds.rule_config` stores a RuleConfig (see
--   src/lib/rules/types.ts) as jsonb. This is the "rules are data, not
--   code" requirement from section 15: the engine in src/lib/rules/engine.ts
--   interprets this value, so a brand-new tournament format is a new
--   RuleConfig value, not a new code path.
-- =============================================================================

create table public.stages (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index stages_tournament_id_idx on public.stages (tournament_id, sort_order);

alter table public.rounds
  add column stage_id uuid references public.stages (id) on delete set null,
  add column rule_config jsonb not null default '{
    "correctPoints": 10,
    "wrongPenalty": 0,
    "throughPenalty": 0,
    "maxWrongAnswers": null,
    "disqualifyOnMaxWrong": false,
    "winCondition": { "type": "OPEN" },
    "placementPoints": null
  }'::jsonb;

create index rounds_stage_id_idx on public.rounds (stage_id);

comment on column public.rounds.rule_config is
  '得点ルール設定(RuleConfig, src/lib/rules/types.ts)。ハードコードせずデータとして保持する。';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.stages enable row level security;

create policy "stages_select_staff"
  on public.stages for select
  using (public.is_tournament_member(tournament_id));

create policy "stages_write_admin"
  on public.stages for insert
  with check (public.is_tournament_admin(tournament_id));

create policy "stages_update_admin"
  on public.stages for update
  using (public.is_tournament_admin(tournament_id))
  with check (public.is_tournament_admin(tournament_id));

create policy "stages_delete_admin"
  on public.stages for delete
  using (public.is_tournament_admin(tournament_id));
