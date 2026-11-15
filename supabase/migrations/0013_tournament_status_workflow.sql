-- =============================================================================
-- Q-Score Pro : 0013
-- 大会ステータスの遷移をDBで強制し、訂正・中止を監査ログ必須にする
--
-- 対応する要件 (CONTRIBUTING.md 8.3章 / codereview.md):
--   R-08 (Issue 9) 公開後の訂正(PUBLISHED→RUNNING、監査ログ必須)と CANCELLED
--
-- 設計方針:
-- - 遷移表は src/lib/tournament/status.ts の ALLOWED_TRANSITIONS と同じ内容を
--   このファイルの tournament_status_transition_allowed() に持つ。対応関係は
--   tests/unit/tournament-status.test.ts がこのファイルを解析して検証する。
--   片方を変えたら、もう片方も必ず同時に直すこと。
-- - 遷移の検証と監査ログの記録は tournaments の BEFORE UPDATE トリガーで行う。
--   アプリのAPIだけでなく、PostgREST を直接叩いても同じ検証が効き、
--   「ステータスは変わったのに監査ログが無い」状態が起きない(同一トランザクション)。
-- - 訂正(PUBLISHED→RUNNING)と中止(→CANCELLED)は理由が必須。理由は RPC
--   change_tournament_status() がトランザクション内の設定値 qscore.status_reason
--   として渡し、トリガーが読んで監査ログに残す。
-- - CANCELLED にできるのは、既に公開されていた状態(受付中〜開催中)からのみ。
--   下書きは公開されたことがないので、中止ではなく削除する。
-- - CANCELLED は終端状態(元に戻せない)。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. 公開範囲: 列挙(IN (...))をやめ「DRAFT 以外」にする
--    列挙のままだと CANCELLED の大会が公開ページから消え、申込者が404を見ることになる。
--    中止された大会は「中止されました」と表示できるよう、公開のままにする。
-- ---------------------------------------------------------------------------
drop policy "tournaments_select_public" on public.tournaments;
create policy "tournaments_select_public"
  on public.tournaments for select
  using (status <> 'DRAFT');

drop policy "announcements_select_public" on public.announcements;
create policy "announcements_select_public"
  on public.announcements for select
  using (
    is_published = true
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.status <> 'DRAFT'
    )
  );

drop policy "schedule_items_select_public" on public.schedule_items;
create policy "schedule_items_select_public"
  on public.schedule_items for select
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.status <> 'DRAFT'
    )
  );

drop policy "entry_form_fields_select_public" on public.entry_form_fields;
create policy "entry_form_fields_select_public"
  on public.entry_form_fields for select
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.status <> 'DRAFT'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. 遷移表と「理由が必要な遷移」
-- ---------------------------------------------------------------------------
create function public.tournament_status_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('DRAFT',               'REGISTRATION_OPEN'),
    ('REGISTRATION_OPEN',   'REGISTRATION_CLOSED'),
    ('REGISTRATION_OPEN',   'DRAFT'),
    ('REGISTRATION_OPEN',   'CANCELLED'),
    ('REGISTRATION_CLOSED', 'RUNNING'),
    ('REGISTRATION_CLOSED', 'REGISTRATION_OPEN'),
    ('REGISTRATION_CLOSED', 'CANCELLED'),
    ('RUNNING',             'FINISHED'),
    ('RUNNING',             'CANCELLED'),
    ('FINISHED',            'PUBLISHED'),
    ('PUBLISHED',           'RUNNING')   -- 公開後の訂正(理由必須)
  );
$$;

-- 訂正(公開結果の取り下げ)と中止は、理由の記録を必須にする
create function public.tournament_status_requires_reason(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select p_from = 'PUBLISHED' or p_to = 'CANCELLED';
$$;

-- ---------------------------------------------------------------------------
-- 3. トリガー: 遷移の検証 + 監査ログの記録 (同一トランザクション)
-- ---------------------------------------------------------------------------
create function public.guard_tournament_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from text := old.status::text;
  v_to text := new.status::text;
  v_reason text;
  v_action text;
  v_summary text;
begin
  if v_from = v_to then
    return new;
  end if;

  if not public.tournament_status_transition_allowed(v_from, v_to) then
    raise exception 'invalid_status_transition'
      using errcode = '22023',
            detail = v_from || ' -> ' || v_to;
  end if;

  v_reason := left(nullif(btrim(coalesce(current_setting('qscore.status_reason', true), '')), ''), 500);

  if public.tournament_status_requires_reason(v_from, v_to) and v_reason is null then
    raise exception 'status_reason_required'
      using errcode = '22023',
            hint = '訂正・中止には理由が必要です';
  end if;

  if v_to = 'CANCELLED' then
    v_action := 'tournament.cancelled';
    v_summary := '大会を中止しました(理由: ' || v_reason || ')';
  elsif v_from = 'PUBLISHED' then
    v_action := 'tournament.status_corrected';
    v_summary := '公開済みの大会を ' || v_to || ' に訂正しました(理由: ' || v_reason || ')';
  else
    v_action := 'tournament.status_changed';
    v_summary := '大会のステータスを ' || v_from || ' から ' || v_to || ' に変更しました';
  end if;

  insert into public.audit_logs (tournament_id, actor_id, action, summary, metadata)
  values (
    old.id,
    auth.uid(),
    v_action,
    v_summary,
    jsonb_build_object('from', v_from, 'to', v_to, 'reason', v_reason)
  );

  return new;
end;
$$;

create trigger guard_tournaments_status_change
  before update of status on public.tournaments
  for each row execute procedure public.guard_tournament_status_change();

-- ---------------------------------------------------------------------------
-- 4. RPC: ステータス変更 (理由つき)
--    security invoker: tournaments の更新RLS(OWNER/ADMIN)がそのまま効く。
--    理由をトリガーへ渡すための入口で、検証はトリガーが行う。
-- ---------------------------------------------------------------------------
create function public.change_tournament_status(
  p_tournament_id uuid,
  p_status text,
  p_reason text default null
)
returns public.tournaments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.tournaments;
  v_count int;
begin
  perform set_config('qscore.status_reason', coalesce(p_reason, ''), true);

  update public.tournaments
     set status = p_status::public.tournament_status
   where id = p_tournament_id
  returning * into v_row;

  -- 注意: PERFORM は FOUND を上書きするため、行数は更新の直後に確保する。
  -- RLS で見えない/更新できない場合は 0 行になる(権限がない場合も not found と同じ扱い)
  get diagnostics v_count = row_count;

  -- 理由は同じトランザクション内の別の更新に持ち越さない
  perform set_config('qscore.status_reason', '', true);

  if v_count = 0 then
    raise exception 'tournament_not_found' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

revoke all on function public.change_tournament_status(uuid, text, text) from public, anon;
grant execute on function public.change_tournament_status(uuid, text, text) to authenticated;
