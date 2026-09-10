-- =============================================================================
-- 0001 適用後の Supabase Database Linter 指摘への対応
--
--   1. SECURITY DEFINER 関数の不要な EXECUTE 権限を剥奪（セキュリティ）
--   2. RLS ポリシー内の auth.uid() を (select auth.uid()) へ置換（パフォーマンス）
--   3. invite_codes.used_by の外部キーにカバリングインデックスを追加
--
-- 背景: Supabase は public スキーマの関数に対し、既定権限で anon /
--       authenticated へ EXECUTE を自動付与する。0001 の
--       `revoke ... from public` では剥がれないため、明示的に剥奪する。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 関数の EXECUTE 権限を必要最小限へ絞る
-- -----------------------------------------------------------------------------

-- トリガ関数は API から呼び出す必要がないため、全ロールから剥奪する
revoke all on function public.handle_new_user()          from anon, authenticated, public;
revoke all on function public.set_updated_at()           from anon, authenticated, public;
revoke all on function public.prevent_role_escalation()  from anon, authenticated, public;

-- 認証済みユーザー専用の関数から anon を剥奪する
revoke all on function public.is_admin()                       from anon;
revoke all on function public.generate_invite_code(integer)    from anon;

-- has_any_user() の anon 実行は意図的に維持する。
-- サインアップ画面で招待コード欄の要否を判定するために未認証から呼ぶ必要があり、
-- 返却値は boolean のみでユーザー数自体は開示しない。
grant execute on function public.has_any_user() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. RLS ポリシーの auth.uid() を InitPlan 化する
--
--    auth.uid() をそのまま書くと行ごとに再評価される。(select auth.uid())
--    と書くことで一度だけ評価され、行数が増えても性能が劣化しない。
-- -----------------------------------------------------------------------------

-- 2-1. profiles
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- 2-2. invite_codes
drop policy if exists invite_codes_select_own on public.invite_codes;
create policy invite_codes_select_own on public.invite_codes
  for select to authenticated
  using (created_by = (select auth.uid()) or (select public.is_admin()));

drop policy if exists invite_codes_delete_own on public.invite_codes;
create policy invite_codes_delete_own on public.invite_codes
  for delete to authenticated
  using (
    (created_by = (select auth.uid()) and is_used = false)
    or (select public.is_admin())
  );

-- 2-3. books
drop policy if exists books_select_own on public.books;
create policy books_select_own on public.books
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists books_insert_own on public.books;
create policy books_insert_own on public.books
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists books_update_own on public.books;
create policy books_update_own on public.books
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists books_delete_own on public.books;
create policy books_delete_own on public.books
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- 2-4. calendar_reservations
drop policy if exists calendar_reservations_select_own on public.calendar_reservations;
create policy calendar_reservations_select_own on public.calendar_reservations
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists calendar_reservations_insert_own on public.calendar_reservations;
create policy calendar_reservations_insert_own on public.calendar_reservations
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.books b
      where b.id = book_id and b.user_id = (select auth.uid())
    )
  );

drop policy if exists calendar_reservations_update_own on public.calendar_reservations;
create policy calendar_reservations_update_own on public.calendar_reservations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.books b
      where b.id = book_id and b.user_id = (select auth.uid())
    )
  );

drop policy if exists calendar_reservations_delete_own on public.calendar_reservations;
create policy calendar_reservations_delete_own on public.calendar_reservations
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 3. 外部キーのカバリングインデックス
--    used_by は「誰がこのコードを使ったか」の逆引きと、
--    profiles 削除時のカスケード判定で参照される。
-- -----------------------------------------------------------------------------
create index if not exists invite_codes_used_by_idx on public.invite_codes (used_by);
