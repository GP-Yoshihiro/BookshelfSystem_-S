-- =============================================================================
-- 発売日アラート (release_alerts) を追加し、未使用の calendar_reservations を削除する
--
-- 【なぜ新しいテーブルを作るのか】
-- calendar_reservations は book_id で books を参照する設計だった。
-- しかし利用者の求める挙動は「作品を登録しておくと、最新巻が出たときに
-- その発売日がカレンダーに載る」というベルアラート方式であり、
-- 発売日の通知と本棚は完全に独立している。
--
-- 未発売の巻はまだ本棚に存在しないため、books を参照する設計では
-- そもそもカレンダーへ載せられない。したがって書籍IDに依存しない
-- 「作品（シリーズ）単位」のテーブルを新設する。
--
-- 【なぜ calendar_reservations を削除するのか】
-- 上記のとおり本用途には使えず、他に使い道もない。未使用のテーブルを
-- 残すと、後から読んだ人がどちらを使うのか迷い、RLS の監査対象も増える。
-- 現時点でデータは0件であることを確認済み。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 発売日アラート本体
-- -----------------------------------------------------------------------------

create table if not exists public.release_alerts (
  id                       uuid        primary key default gen_random_uuid(),
  user_id                  uuid        not null references public.profiles (id) on delete cascade,
  -- 作品の同一性を判定する鍵。楽天の検索結果から機械的に作る
  series_key               text        not null,
  series_title             text        not null,
  -- 最新巻の情報。楽天へ問い合わせるたびに更新される
  latest_volume            integer,
  latest_title             text        not null,
  latest_isbn              text        not null,
  -- 確定した発売日のみ入れる。「2026年秋」のような表記は下の text 側へ
  latest_release_date      date,
  latest_release_date_text text,
  cover_image_url          text,
  -- 楽天へ最後に問い合わせた時刻。更新の要否をこれで判断する
  checked_at               timestamptz not null default now(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- 同じ作品を二重に登録できないようにする
  constraint release_alerts_unique unique (user_id, series_key)
);

comment on table  public.release_alerts is
  '発売日アラート。作品単位で登録し、最新巻の発売日をカレンダーへ載せる。本棚(books)とは独立している';
comment on column public.release_alerts.series_key is
  '作品の同一性を判定する鍵。楽天の検索結果のタイトルから機械的に作る';
comment on column public.release_alerts.latest_release_date is
  '確定した発売日のみ。「2026年秋」のような表記は latest_release_date_text へ入れる';
comment on column public.release_alerts.checked_at is
  '楽天へ最後に問い合わせた時刻。一定時間を過ぎたものだけ更新するために使う';

-- -----------------------------------------------------------------------------
-- 2. インデックス
-- -----------------------------------------------------------------------------

-- カレンダーは「自分のアラートを発売日順に」読むため、複合で張る
create index if not exists release_alerts_user_date_idx
  on public.release_alerts (user_id, latest_release_date);

-- 更新対象（checked_at が古いもの）の絞り込み用
create index if not exists release_alerts_user_checked_idx
  on public.release_alerts (user_id, checked_at);

-- -----------------------------------------------------------------------------
-- 3. updated_at の自動更新
-- -----------------------------------------------------------------------------

drop trigger if exists release_alerts_set_updated_at on public.release_alerts;
create trigger release_alerts_set_updated_at
  before update on public.release_alerts
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. RLS
--    既存テーブルと同じく、自分の行だけを対象にする。
--    (select auth.uid()) の形にしているのは、行ごとに関数を評価させず
--    一度だけ評価させるため（0002 と同じ方針）。
-- -----------------------------------------------------------------------------

alter table public.release_alerts enable row level security;

drop policy if exists release_alerts_select_own on public.release_alerts;
create policy release_alerts_select_own on public.release_alerts
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists release_alerts_insert_own on public.release_alerts;
create policy release_alerts_insert_own on public.release_alerts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists release_alerts_update_own on public.release_alerts;
create policy release_alerts_update_own on public.release_alerts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists release_alerts_delete_own on public.release_alerts;
create policy release_alerts_delete_own on public.release_alerts
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 5. 未使用テーブルの削除
--    ポリシーごと消える。データは0件であることを確認済み。
-- -----------------------------------------------------------------------------

drop table if exists public.calendar_reservations;
