-- =============================================================================
-- Q-Score Pro : 0011
-- エントリーの重複防止・流量制限 / スタッフ(tournament_members)のOWNER保護
--
-- 対応する要件 (CONTRIBUTING.md 8.2章 / codereview.md):
--   R-05 (Issue 4) 公開エントリーAPIのレート制限と重複防止
--   R-06 (Issue 5) スタッフの削除・ロール変更(OWNERの削除・降格は不可)
--
-- 設計方針:
-- - 公開エントリーは、匿名ユーザーが PostgREST を直接叩いても INSERT できる
--   (RLS: entries_insert_public_when_open)。アプリ層だけの制限は回避されるため、
--   重複防止と流量制限は DB のトリガーで行う。
-- - 重複判定は (tournament_id, lower(email)) で、状態が SUBMITTED の行のみが対象。
--   WITHDRAWN(取り下げ)済みの人は再エントリーできる。
--   同時送信でもすり抜けないよう、メールごとに advisory lock を取って直列化する。
-- - 流量制限は大会単位(1分間の受付上限)。IP単位の制限は DB からは信頼できる
--   IP が取れないため、APIルート側のベストエフォートで行う。
-- - tournament_members の OWNER は「大会作成者(tournaments.owner_id)だけ」が持てる。
--   既存のRLS(admin は insert/update/delete 可)では、ADMIN が OWNER を新規付与したり
--   OWNER を降格・削除できてしまうため、トリガーで塞ぐ。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. R-05 : entries の重複防止と流量制限
-- ---------------------------------------------------------------------------

-- 重複判定用の部分インデックス (一意制約ではなく、トリガーが一意性を保証する。
-- 既存データに重複がある環境でもマイグレーションが失敗しないようにするため)
create index entries_tournament_lower_email_idx
  on public.entries (tournament_id, lower(email))
  where status = 'SUBMITTED';

create function public.guard_entry_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 1大会あたり、1分間に受け付けるエントリー数の上限。
  -- 人気大会の受付開始直後の集中(数十件/分)は許容し、機械的な大量投入を止める値。
  c_max_per_minute constant int := 60;
  v_recent int;
begin
  new.email := btrim(new.email);

  -- 同じ大会・同じメールの同時INSERTを直列化する
  perform pg_advisory_xact_lock(
    hashtextextended('entries:' || new.tournament_id::text || ':' || lower(new.email), 0)
  );

  if new.status = 'SUBMITTED' and exists (
    select 1
    from public.entries e
    where e.tournament_id = new.tournament_id
      and lower(e.email) = lower(new.email)
      and e.status = 'SUBMITTED'
  ) then
    raise exception 'entry_duplicate'
      using errcode = '23505',
            hint = 'このメールアドレスは、この大会に既にエントリー済みです';
  end if;

  select count(*) into v_recent
  from public.entries e
  where e.tournament_id = new.tournament_id
    and e.submitted_at > now() - interval '1 minute';

  if v_recent >= c_max_per_minute then
    raise exception 'entry_rate_limited'
      using errcode = 'QS429',
            hint = '短時間にエントリーが集中しています。少し待ってから再度お試しください';
  end if;

  return new;
end;
$$;

create trigger guard_entries_insert
  before insert on public.entries
  for each row execute procedure public.guard_entry_insert();

-- ---------------------------------------------------------------------------
-- 2. R-06 : tournament_members の OWNER 保護
-- ---------------------------------------------------------------------------

create function public.guard_tournament_member_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  if tg_op = 'INSERT' then
    -- OWNER を持てるのは大会作成者だけ (作成直後の bootstrap 登録)
    if new.role = 'OWNER' then
      select t.owner_id into v_owner_id from public.tournaments t where t.id = new.tournament_id;
      if new.user_id is distinct from v_owner_id then
        raise exception 'owner_role_reserved'
          using errcode = '42501',
                hint = 'OWNER は大会の作成者のみが持てます';
      end if;
    end if;
    return new;

  elsif tg_op = 'UPDATE' then
    if new.tournament_id is distinct from old.tournament_id
       or new.user_id is distinct from old.user_id then
      raise exception 'member_identity_immutable'
        using errcode = '22023',
              hint = 'スタッフの大会・ユーザーは変更できません';
    end if;
    if old.role = 'OWNER' and new.role <> 'OWNER' then
      raise exception 'owner_cannot_be_demoted'
        using errcode = '42501',
              hint = 'OWNER の権限は変更できません';
    end if;
    if new.role = 'OWNER' and old.role <> 'OWNER' then
      raise exception 'owner_role_reserved'
        using errcode = '42501',
              hint = 'OWNER は大会の作成者のみが持てます';
    end if;
    return new;

  else -- DELETE
    -- 大会そのものが削除されている最中(カスケード)は OWNER 行も消えてよい。
    -- 大会が存在する間は OWNER を削除できない。
    if old.role = 'OWNER'
       and exists (select 1 from public.tournaments t where t.id = old.tournament_id) then
      raise exception 'owner_cannot_be_removed'
        using errcode = '42501',
              hint = 'OWNER は削除できません';
    end if;
    return old;
  end if;
end;
$$;

create trigger guard_tournament_members_change
  before insert or update or delete on public.tournament_members
  for each row execute procedure public.guard_tournament_member_change();
