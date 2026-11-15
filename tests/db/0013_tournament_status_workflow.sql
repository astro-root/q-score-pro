-- =============================================================================
-- DB回帰テスト: 0012/0013 (R-08 大会ステータスの訂正・中止と遷移の強制)
--
-- 実行方法 (ローカルSupabaseを起動した状態で。全体をロールバックするので何も残らない):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f tests/db/0013_tournament_status_workflow.sql
-- 成功すると最後に "ALL PASSED" が出る。失敗すると "FAIL: ..." で止まる。
-- =============================================================================
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@s.example'),
  ('00000000-0000-0000-0000-0000000000b1', 'admin@s.example'),
  ('00000000-0000-0000-0000-0000000000c1', 'op@s.example');

insert into public.tournaments (id, slug, name, status, owner_id) values
  ('20000000-0000-0000-0000-000000000001', 't-status-main',   'Main',   'DRAFT', '00000000-0000-0000-0000-0000000000a1'),
  ('20000000-0000-0000-0000-000000000002', 't-status-cancel', 'Cancel', 'DRAFT', '00000000-0000-0000-0000-0000000000a1');

insert into public.tournament_members (tournament_id, user_id, role)
select t.id, u.user_id, u.role::public.tournament_member_role
from public.tournaments t
cross join (values
  ('00000000-0000-0000-0000-0000000000a1'::uuid, 'OWNER'),
  ('00000000-0000-0000-0000-0000000000b1'::uuid, 'ADMIN'),
  ('00000000-0000-0000-0000-0000000000c1'::uuid, 'SCORE_OPERATOR')
) as u(user_id, role)
where t.slug in ('t-status-main', 't-status-cancel');

-- ---------------------------------------------------------------------------
-- 通常の遷移・不正な遷移 (ADMIN)
-- ---------------------------------------------------------------------------
do $$
declare
  v_hit boolean;
  c_t constant uuid := '20000000-0000-0000-0000-000000000001';
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000000b1', 'role', 'authenticated')::text, true);
  set local role authenticated;

  perform public.change_tournament_status(c_t, 'REGISTRATION_OPEN');
  if (select status from public.tournaments where id = c_t) <> 'REGISTRATION_OPEN' then
    raise exception 'FAIL: 通常の遷移(DRAFT→REGISTRATION_OPEN)が反映されない';
  end if;

  -- 段飛ばしはRPCでも、テーブルを直接更新(PostgREST直叩き相当)でも拒否される
  v_hit := false;
  begin
    perform public.change_tournament_status(c_t, 'RUNNING');
  exception when others then v_hit := (sqlerrm = 'invalid_status_transition'); end;
  if not v_hit then raise exception 'FAIL: 段飛ばし遷移がRPCで拒否されない'; end if;

  v_hit := false;
  begin
    update public.tournaments set status = 'FINISHED' where id = c_t;
  exception when others then v_hit := (sqlerrm = 'invalid_status_transition'); end;
  if not v_hit then raise exception 'FAIL: 段飛ばし遷移が直接UPDATEで拒否されない'; end if;

  -- 直接UPDATEでは理由を渡せないので、中止は拒否される
  v_hit := false;
  begin
    update public.tournaments set status = 'CANCELLED' where id = c_t;
  exception when others then v_hit := (sqlerrm = 'status_reason_required'); end;
  if not v_hit then raise exception 'FAIL: 理由なしの中止(直接UPDATE)が拒否されない'; end if;

  perform public.change_tournament_status(c_t, 'REGISTRATION_CLOSED');
  perform public.change_tournament_status(c_t, 'RUNNING');
  perform public.change_tournament_status(c_t, 'FINISHED');
  perform public.change_tournament_status(c_t, 'PUBLISHED');
  reset role;

  if (select count(*) from public.audit_logs where tournament_id = c_t and action = 'tournament.status_changed') <> 5 then
    raise exception 'FAIL: 通常の遷移5回ぶんの監査ログが残っていない';
  end if;
  if exists (
    select 1 from public.audit_logs
    where tournament_id = c_t and actor_id is distinct from '00000000-0000-0000-0000-0000000000b1'
  ) then
    raise exception 'FAIL: 監査ログの実行者(actor_id)が記録されていない';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 公開後の訂正 (PUBLISHED → RUNNING): 理由必須 + 監査ログ必須
-- ---------------------------------------------------------------------------
do $$
declare
  v_hit boolean;
  c_t constant uuid := '20000000-0000-0000-0000-000000000001';
  v_meta jsonb;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000000b1', 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_hit := false;
  begin
    perform public.change_tournament_status(c_t, 'RUNNING');
  exception when others then v_hit := (sqlerrm = 'status_reason_required'); end;
  if not v_hit then raise exception 'FAIL: 理由なしの訂正が拒否されない'; end if;

  -- 空白だけの理由も「理由なし」
  v_hit := false;
  begin
    perform public.change_tournament_status(c_t, 'RUNNING', '   ');
  exception when others then v_hit := (sqlerrm = 'status_reason_required'); end;
  if not v_hit then raise exception 'FAIL: 空白だけの理由が受理される'; end if;

  if (select status from public.tournaments where id = c_t) <> 'PUBLISHED' then
    raise exception 'FAIL: 拒否された訂正で状態が変わってしまった';
  end if;

  perform public.change_tournament_status(c_t, 'RUNNING', '得点の入力ミスを訂正するため');
  reset role;

  select metadata into v_meta
  from public.audit_logs
  where tournament_id = c_t and action = 'tournament.status_corrected';
  if v_meta is null then raise exception 'FAIL: 訂正の監査ログが残っていない'; end if;
  if v_meta ->> 'reason' <> '得点の入力ミスを訂正するため'
     or v_meta ->> 'from' <> 'PUBLISHED' or v_meta ->> 'to' <> 'RUNNING' then
    raise exception 'FAIL: 訂正の監査ログの内容が正しくない: %', v_meta;
  end if;

  -- 理由が次の更新に持ち越されない(同一トランザクション内でも)
  set local role authenticated;
  perform public.change_tournament_status(c_t, 'FINISHED');
  perform public.change_tournament_status(c_t, 'PUBLISHED');
  v_hit := false;
  begin
    update public.tournaments set status = 'RUNNING' where id = c_t;
  exception when others then v_hit := (sqlerrm = 'status_reason_required'); end;
  reset role;
  if not v_hit then raise exception 'FAIL: 前回の理由が持ち越されて、理由なし訂正が通ってしまう'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 中止 (CANCELLED)
-- ---------------------------------------------------------------------------
do $$
declare
  v_hit boolean;
  c_t constant uuid := '20000000-0000-0000-0000-000000000002';
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000000b1', 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 下書きは中止できない(公開されたことがないので、削除する)
  v_hit := false;
  begin
    perform public.change_tournament_status(c_t, 'CANCELLED', '理由');
  exception when others then v_hit := (sqlerrm = 'invalid_status_transition'); end;
  if not v_hit then raise exception 'FAIL: DRAFT→CANCELLED が拒否されない'; end if;

  perform public.change_tournament_status(c_t, 'REGISTRATION_OPEN');

  v_hit := false;
  begin
    perform public.change_tournament_status(c_t, 'CANCELLED');
  exception when others then v_hit := (sqlerrm = 'status_reason_required'); end;
  if not v_hit then raise exception 'FAIL: 理由なしの中止が拒否されない'; end if;

  -- スタッフでも ADMIN 未満(SCORE_OPERATOR)は変更できない
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000000c1', 'role', 'authenticated')::text, true);
  v_hit := false;
  begin
    perform public.change_tournament_status(c_t, 'CANCELLED', '権限のない中止');
  exception when others then v_hit := (sqlstate = 'P0002'); end;
  if not v_hit then raise exception 'FAIL: SCORE_OPERATOR がステータスを変更できてしまう'; end if;

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000000b1', 'role', 'authenticated')::text, true);
  perform public.change_tournament_status(c_t, 'CANCELLED', '会場が使用できなくなったため');

  -- CANCELLED は終端状態
  v_hit := false;
  begin
    perform public.change_tournament_status(c_t, 'DRAFT');
  exception when others then v_hit := (sqlerrm = 'invalid_status_transition'); end;
  if not v_hit then raise exception 'FAIL: CANCELLED から戻せてしまう'; end if;
  reset role;

  if not exists (
    select 1 from public.audit_logs
    where tournament_id = c_t and action = 'tournament.cancelled'
      and metadata ->> 'reason' = '会場が使用できなくなったため'
  ) then
    raise exception 'FAIL: 中止の監査ログが残っていない';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 公開範囲: 中止された大会は公開のまま(申込者が404を見ない)、下書きは非公開
-- ---------------------------------------------------------------------------
do $$
declare
  v_n int;
begin
  insert into public.tournaments (id, slug, name, status, owner_id) values
    ('20000000-0000-0000-0000-000000000003', 't-status-draft', 'Draft', 'DRAFT', '00000000-0000-0000-0000-0000000000a1');

  set local role anon;
  select count(*) into v_n from public.tournaments where slug = 't-status-cancel';
  if v_n <> 1 then raise exception 'FAIL: 中止された大会が公開ページから見えない'; end if;
  select count(*) into v_n from public.tournaments where slug = 't-status-draft';
  if v_n <> 0 then raise exception 'FAIL: 下書きの大会が匿名に見えてしまう'; end if;
  reset role;
end $$;

select 'ALL PASSED' as result;
rollback;
