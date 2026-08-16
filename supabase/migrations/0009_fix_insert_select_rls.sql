-- =============================================================================
-- Q-Score Pro : Phase 9 hotfix
-- INSERT ... RETURNING と RLS SELECT ポリシーの不整合を修正
--
-- 背景:
-- PostgRESTは `.insert(...).select()` を使うと INSERT に RETURNING が付与され、
-- その返り値にも通常のSELECT用RLSポリシーが適用される。これにより、
-- 「INSERT自体はWITH CHECKを満たして成功するはずなのに、直後の
-- RETURNINGがSELECTポリシーに阻まれてエラーになる」というケースが
-- 2箇所で発生していた(自動検証スクリプトで発見)。
--
-- 1. 大会作成直後: 作成者はまだ tournament_members に登録されておらず、
--    かつ大会はDRAFTのため tournaments_select_staff / _select_public の
--    どちらにも該当しなかった。
-- 2. 公開エントリーフォームからの投稿: entries は元々スタッフのみ閲覧
--    可能なため、匿名の応募者が自分の投稿を読み返せなかった。
--
-- (2)はアプリケーション側で `.select()` を外すことで対応済み
--    (匿名ユーザーに entries の読み取り権限を与える必要はそもそも無いため)。
-- (1)は「オーナーは自分の大会を常に見られる」という自然な権限のため、
--    RLSポリシーとして追加するのが正しい対応。
-- =============================================================================

create policy "tournaments_select_owner"
  on public.tournaments for select
  using (owner_id = auth.uid());
