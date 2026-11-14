-- =============================================================================
-- DB回帰テスト: 0011 (R-05 エントリーの重複防止・流量制限 / R-06 OWNER保護)
--
-- 実行方法 (ローカルSupabaseを起動した状態で。全体をロールバックするので何も残らない):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f tests/db/0011_entry_guard_and_member_protection.sql
-- 成功すると最後に "ALL PASSED" が出る。失敗すると "FAIL: ..." で止まる。
-- =============================================================================
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@t.example'),
  ('00000000-0000-0000-0000-00000000000b', 'admin@t.example'),
  ('00000000-0000-0000-0000-00000000000c', 'op@t.example');

insert into public.tournaments (id, slug, name, status, owner_id) values
  ('10000000-0000-0000-0000-000000000001', 't-guard-open', 'T', 'REGISTRATION_OPEN', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000002', 't-guard-del',  'D', 'DRAFT',             '00000000-0000-0000-0000-00000000000a');

insert into public.tournament_members (tournament_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'OWNER'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'ADMIN'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'SCORE_OPERATOR'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'OWNER');

-- ---------------------------------------------------------------------------
-- R-05: 匿名ユーザーによるエントリー
-- ---------------------------------------------------------------------------
do $$
declare v_hit boolean;
begin
  set local role anon;

  insert into public.entries (tournament_id, display_name, email)
  values ('10000000-0000-0000-0000-000000000001', 'A', 'Foo@Example.com');

  -- 大文字小文字・前後の空白が違っても同じメールとして重複扱い
  v_hit := false;
  begin
    insert into public.entries (tournament_id, display_name, email)
    values ('10000000-0000-0000-0000-000000000001', 'B', '  foo@example.COM ');
  exception when others then
    v_hit := (sqlstate = '23505' and sqlerrm = 'entry_duplicate');
  end;
  if not v_hit then raise exception 'FAIL: 同じメールの重複エントリーが拒否されない'; end if;

  -- 別のメールは通る
  insert into public.entries (tournament_id, display_name, email)
  values ('10000000-0000-0000-0000-000000000001', 'C', 'bar@example.com');

  reset role;
  -- 取り下げ済みなら同じメールで再エントリーできる
  update public.entries set status = 'WITHDRAWN' where lower(email) = 'foo@example.com';
  set local role anon;
  insert into public.entries (tournament_id, display_name, email)
  values ('10000000-0000-0000-0000-000000000001', 'A2', 'foo@example.com');
  reset role;
end $$;

do $$
declare
  v_hit boolean := false;
  v_ok int := 0;
  i int;
begin
  set local role anon;
  -- ここまでに3件。1分間の上限(60件)に達したら QS429 で止まる
  for i in 1..70 loop
    begin
      insert into public.entries (tournament_id, display_name, email)
      values ('10000000-0000-0000-0000-000000000001', 'u' || i, 'u' || i || '@e.example');
      v_ok := v_ok + 1;
    exception when others then
      v_hit := (sqlstate = 'QS429' and sqlerrm = 'entry_rate_limited');
      exit;
    end;
  end loop;
  reset role;
  if not v_hit then raise exception 'FAIL: 流量制限(QS429)に達しない'; end if;
  if v_ok <> 57 then raise exception 'FAIL: 上限までの受付件数が想定と違う (got %, want 57)', v_ok; end if;
end $$;

-- ---------------------------------------------------------------------------
-- R-06: ADMIN によるスタッフ操作
-- ---------------------------------------------------------------------------
do $$
declare
  v_hit boolean;
  c_t constant uuid := '10000000-0000-0000-0000-000000000001';
  c_op constant uuid := '00000000-0000-0000-0000-00000000000c';
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- OWNER の降格は不可
  v_hit := false;
  begin
    update public.tournament_members set role = 'VIEWER' where tournament_id = c_t and role = 'OWNER';
  exception when others then v_hit := (sqlerrm = 'owner_cannot_be_demoted'); end;
  if not v_hit then raise exception 'FAIL: ADMIN が OWNER を降格できてしまう'; end if;

  -- OWNER の削除は不可
  v_hit := false;
  begin
    delete from public.tournament_members where tournament_id = c_t and role = 'OWNER';
  exception when others then v_hit := (sqlerrm = 'owner_cannot_be_removed'); end;
  if not v_hit then raise exception 'FAIL: ADMIN が OWNER を削除できてしまう'; end if;

  -- 他人を OWNER に昇格できない
  v_hit := false;
  begin
    update public.tournament_members set role = 'OWNER' where user_id = c_op;
  exception when others then v_hit := (sqlerrm = 'owner_role_reserved'); end;
  if not v_hit then raise exception 'FAIL: ADMIN が OWNER を新規に付与できる(UPDATE)'; end if;

  -- OWNER 行を直接 INSERT することもできない
  delete from public.tournament_members where user_id = c_op;
  v_hit := false;
  begin
    insert into public.tournament_members (tournament_id, user_id, role) values (c_t, c_op, 'OWNER');
  exception when others then v_hit := (sqlerrm = 'owner_role_reserved'); end;
  if not v_hit then raise exception 'FAIL: ADMIN が OWNER を新規に付与できる(INSERT)'; end if;

  -- 一般スタッフの追加・ロール変更・削除は通る
  insert into public.tournament_members (tournament_id, user_id, role) values (c_t, c_op, 'SCORE_OPERATOR');
  update public.tournament_members set role = 'GRADER' where user_id = c_op;
  if (select role from public.tournament_members where user_id = c_op and tournament_id = c_t) <> 'GRADER' then
    raise exception 'FAIL: ロール変更が反映されない';
  end if;

  -- 行の付け替え(user_id の変更)は不可
  v_hit := false;
  begin
    update public.tournament_members
       set user_id = '00000000-0000-0000-0000-00000000000b' where user_id = c_op;
  exception when others then v_hit := (sqlerrm = 'member_identity_immutable'); end;
  if not v_hit then raise exception 'FAIL: user_id を付け替えられる'; end if;

  delete from public.tournament_members where user_id = c_op and tournament_id = c_t;
  reset role;
  if exists (select 1 from public.tournament_members where user_id = c_op and tournament_id = c_t) then
    raise exception 'FAIL: 一般スタッフを削除できない';
  end if;
end $$;

-- 大会を削除すると OWNER 行もカスケードで消える(保護トリガーが邪魔しない)
do $$
begin
  delete from public.tournaments where id = '10000000-0000-0000-0000-000000000002';
  if exists (select 1 from public.tournament_members where tournament_id = '10000000-0000-0000-0000-000000000002') then
    raise exception 'FAIL: 大会削除のカスケードで OWNER 行が残る';
  end if;
end $$;

select 'ALL PASSED' as result;
rollback;
