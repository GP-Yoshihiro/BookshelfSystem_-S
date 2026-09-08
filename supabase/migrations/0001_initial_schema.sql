-- =============================================================================
-- BookshelfSystem_-S 初期スキーマ
-- 対象: Supabase (PostgreSQL 15+) / Supabase Auth
--
-- 構成:
--   1. 拡張機能 / ENUM 型
--   2. テーブル (profiles / invite_codes / books / calendar_reservations)
--   3. インデックス
--   4. 共通トリガ関数 (updated_at)
--   5. 認証フック (初回登録特例 + 招待コード検証)
--   6. RPC 関数 (has_any_user / generate_invite_code / redeem 系)
--   7. RLS (Row Level Security) ポリシー
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 拡張機能 / ENUM 型
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto" with schema extensions;

-- ユーザーロール: 管理者 / 一般
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'user');
  end if;
end
$$;

-- 書籍分類: 単行本 / シリーズ単行本 / ライトノベル / コミック
do $$
begin
  if not exists (select 1 from pg_type where typname = 'book_category') then
    create type public.book_category as enum (
      'tankobon',
      'series_tankobon',
      'light_novel',
      'comic'
    );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. テーブル
-- -----------------------------------------------------------------------------

-- 2-1. profiles: auth.users の拡張プロフィールと権限
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text        not null default '',
  role         public.user_role not null default 'user',
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table  public.profiles is 'auth.users を拡張するユーザープロフィールと権限';
comment on column public.profiles.role is '1人目のユーザーは admin、2人目以降は user';

-- 2-2. invite_codes: 招待コードの発行と使用状況
create table if not exists public.invite_codes (
  id         uuid primary key default gen_random_uuid(),
  code       text        not null unique,
  created_by uuid        not null references public.profiles (id) on delete cascade,
  used_by    uuid                 references public.profiles (id) on delete set null,
  is_used    boolean     not null default false,
  used_at    timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  -- 使用済みフラグと使用者・使用日時の整合性を担保する
  constraint invite_codes_usage_consistent check (
    (is_used = false and used_by is null and used_at is null)
    or (is_used = true and used_at is not null)
  )
);

comment on table public.invite_codes is '招待コード。2人目以降のサインアップに必須';

-- 2-3. books: 本棚（ユーザー別に保持する構成）
create table if not exists public.books (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid        not null references public.profiles (id) on delete cascade,
  isbn                text        not null,
  title               text        not null,
  title_kana          text,
  author              text        not null default '',
  publisher           text        not null default '',
  category            public.book_category not null,
  is_ongoing          boolean     not null default false,
  cover_image_url     text,
  description         text,
  is_purchased        boolean     not null default false,
  purchased_at        timestamptz,
  latest_release_date date,
  item_url            text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- 同一ユーザー内での ISBN 重複を防ぐ
  constraint books_user_isbn_unique unique (user_id, isbn),
  -- 連載中フラグはシリーズ単行本・ライトノベル・コミックのみ true を許容
  constraint books_is_ongoing_category_valid check (
    is_ongoing = false
    or category in ('series_tankobon', 'light_novel', 'comic')
  ),
  -- 購入日時は購入済みの場合のみ保持する
  constraint books_purchased_consistent check (
    is_purchased = true or purchased_at is null
  )
);

comment on table  public.books is 'ユーザーごとの本棚。楽天ブックスAPI取得結果を購入時に保存する';
comment on column public.books.title_kana is 'タイトル五十音順ソート用のカナ表記';
comment on column public.books.is_ongoing is '連載中フラグ。シリーズ単行本・ラノベ・コミックでのみ有効';

-- 2-4. calendar_reservations: 発売日予約カレンダー
create table if not exists public.calendar_reservations (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid        not null references public.profiles (id) on delete cascade,
  book_id                uuid        not null references public.books (id) on delete cascade,
  scheduled_release_date date        not null,
  note                   text,
  created_at             timestamptz not null default now(),
  -- 同一書籍・同一日付の重複予約を防ぐ
  constraint calendar_reservations_unique unique (user_id, book_id, scheduled_release_date)
);

comment on table public.calendar_reservations is 'ユーザーがカレンダーに登録した発売予定日';

-- -----------------------------------------------------------------------------
-- 3. インデックス
-- -----------------------------------------------------------------------------
create index if not exists invite_codes_created_by_idx  on public.invite_codes (created_by);
create index if not exists invite_codes_is_used_idx     on public.invite_codes (is_used);

create index if not exists books_user_id_idx            on public.books (user_id);
create index if not exists books_category_idx           on public.books (user_id, category);
create index if not exists books_publisher_idx          on public.books (user_id, publisher);
create index if not exists books_is_purchased_idx       on public.books (user_id, is_purchased);
create index if not exists books_latest_release_idx     on public.books (user_id, latest_release_date);
-- リアルタイム検索（タイトル・著者の部分一致）用の trigram インデックス
create extension if not exists "pg_trgm" with schema extensions;
create index if not exists books_title_trgm_idx  on public.books using gin (title extensions.gin_trgm_ops);
create index if not exists books_author_trgm_idx on public.books using gin (author extensions.gin_trgm_ops);

create index if not exists calendar_reservations_user_date_idx
  on public.calendar_reservations (user_id, scheduled_release_date);
create index if not exists calendar_reservations_book_id_idx
  on public.calendar_reservations (book_id);

-- -----------------------------------------------------------------------------
-- 4. 共通トリガ関数: updated_at 自動更新
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists books_set_updated_at on public.books;
create trigger books_set_updated_at
  before update on public.books
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. 認証フック: サインアップ時のプロフィール作成と招待コード検証
--
--    機能要件A に対応する。
--      - DB にユーザーが 1 人も存在しない場合のみ招待コード不要 かつ role=admin
--      - 2 人目以降は raw_user_meta_data.invite_code の検証を必須とし、
--        無効な場合は例外を送出してサインアップ自体を中止する
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_first_user boolean;
  v_input_code    text;
  v_invite        public.invite_codes%rowtype;
  v_role          public.user_role;
begin
  -- 自分自身を除いた既存ユーザーの有無を判定する
  select not exists (
    select 1 from public.profiles where id <> new.id
  ) into v_is_first_user;

  if v_is_first_user then
    -- 初回登録特例: 招待コード不要。1人目は管理者とする
    v_role := 'admin';
  else
    v_role := 'user';
    v_input_code := nullif(trim(new.raw_user_meta_data ->> 'invite_code'), '');

    if v_input_code is null then
      raise exception '招待コードが指定されていません。'
        using errcode = 'check_violation';
    end if;

    -- 同時サインアップによる二重使用を防ぐため行ロックを取得する
    select * into v_invite
    from public.invite_codes
    where code = v_input_code
    for update;

    if not found then
      raise exception '招待コードが正しくありません。'
        using errcode = 'check_violation';
    end if;

    if v_invite.is_used then
      raise exception 'この招待コードは既に使用されています。'
        using errcode = 'check_violation';
    end if;

    if v_invite.expires_at is not null and v_invite.expires_at < now() then
      raise exception 'この招待コードは有効期限が切れています。'
        using errcode = 'check_violation';
    end if;
  end if;

  insert into public.profiles (id, display_name, role, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'ユーザー'
    ),
    v_role,
    nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), '')
  );

  -- プロフィール作成後に招待コードを使用済みへ更新する（外部キー制約を満たすため）
  if not v_is_first_user then
    update public.invite_codes
    set is_used = true,
        used_by = new.id,
        used_at = now()
    where id = v_invite.id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 6. RPC 関数
-- -----------------------------------------------------------------------------

-- 6-1. has_any_user: 既存ユーザーの有無。サインアップ画面で招待コード欄の
--      要否を切り替えるために未認証(anon)から呼び出せる必要がある。
--      件数そのものは返さず boolean のみを返し、情報漏洩を最小化する。
create or replace function public.has_any_user()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (select 1 from public.profiles);
$$;

comment on function public.has_any_user() is
  '既存ユーザーが1人以上いるかを返す。初回登録特例の判定に使用する';

-- 6-2. generate_invite_code: 認証済みユーザーが招待コードを発行する
create or replace function public.generate_invite_code(p_expires_in_days integer default null)
returns public.invite_codes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_code   text;
  v_result public.invite_codes%rowtype;
  v_tries  integer := 0;
begin
  if v_uid is null then
    raise exception '認証が必要です。' using errcode = 'insufficient_privilege';
  end if;

  if p_expires_in_days is not null and p_expires_in_days <= 0 then
    raise exception '有効期限は1日以上で指定してください。' using errcode = 'check_violation';
  end if;

  -- 衝突時は再生成する（実用上ほぼ発生しないが念のため上限を設ける）
  loop
    v_tries := v_tries + 1;
    -- 紛らわしい文字(0/O/1/I)を除いた12桁のコードを生成する
    v_code := upper(
      translate(
        substr(encode(extensions.gen_random_bytes(12), 'base64'), 1, 12),
        '+/=0O1Il', 'ABCDEFGH'
      )
    );

    begin
      insert into public.invite_codes (code, created_by, expires_at)
      values (
        v_code,
        v_uid,
        case when p_expires_in_days is null then null
             else now() + make_interval(days => p_expires_in_days) end
      )
      returning * into v_result;
      return v_result;
    exception when unique_violation then
      if v_tries >= 5 then
        raise exception '招待コードの生成に失敗しました。再度お試しください。';
      end if;
    end;
  end loop;
end;
$$;

comment on function public.generate_invite_code(integer) is
  '認証済みユーザーが招待コードを発行する。呼び出し元を created_by に記録する';

-- 6-3. 実行権限
revoke all on function public.has_any_user()             from public;
revoke all on function public.generate_invite_code(integer) from public;
grant execute on function public.has_any_user()             to anon, authenticated;
grant execute on function public.generate_invite_code(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. RLS (Row Level Security) ポリシー
--
--    全テーブルで RLS を有効化し、既定は「拒否」とする。
--    books / calendar_reservations は完全な自己所有モデル。
-- -----------------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.invite_codes          enable row level security;
alter table public.books                 enable row level security;
alter table public.calendar_reservations enable row level security;

-- 管理者判定を再利用するためのヘルパー。
-- profiles のポリシー内から profiles を参照すると再帰するため security definer とする。
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- 7-1. profiles
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- INSERT / DELETE のポリシーは意図的に作成しない。
-- 行の作成は handle_new_user トリガ(security definer)、削除は auth.users の
-- カスケードのみに限定する。

-- 一般ユーザーによる role の自己昇格を防ぐ。
-- 管理者、および auth.uid() を持たない service_role 経由の変更は許可する。
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'ロールの変更は許可されていません。'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_role_escalation on public.profiles;
create trigger profiles_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_escalation();

-- 7-2. invite_codes
--      自分が発行したコードのみ閲覧可能。管理者は全件閲覧できる。
drop policy if exists invite_codes_select_own on public.invite_codes;
create policy invite_codes_select_own on public.invite_codes
  for select to authenticated
  using (created_by = auth.uid() or public.is_admin());

--      発行は generate_invite_code() 経由のみとし、直接 INSERT は許可しない。
drop policy if exists invite_codes_delete_own on public.invite_codes;
create policy invite_codes_delete_own on public.invite_codes
  for delete to authenticated
  using ((created_by = auth.uid() and is_used = false) or public.is_admin());

-- 7-3. books
drop policy if exists books_select_own on public.books;
create policy books_select_own on public.books
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists books_insert_own on public.books;
create policy books_insert_own on public.books
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists books_update_own on public.books;
create policy books_update_own on public.books
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists books_delete_own on public.books;
create policy books_delete_own on public.books
  for delete to authenticated
  using (user_id = auth.uid());

-- 7-4. calendar_reservations
--      book_id が自分の書籍であることも併せて検証する。
drop policy if exists calendar_reservations_select_own on public.calendar_reservations;
create policy calendar_reservations_select_own on public.calendar_reservations
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists calendar_reservations_insert_own on public.calendar_reservations;
create policy calendar_reservations_insert_own on public.calendar_reservations
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.books b
      where b.id = book_id and b.user_id = auth.uid()
    )
  );

drop policy if exists calendar_reservations_update_own on public.calendar_reservations;
create policy calendar_reservations_update_own on public.calendar_reservations
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.books b
      where b.id = book_id and b.user_id = auth.uid()
    )
  );

drop policy if exists calendar_reservations_delete_own on public.calendar_reservations;
create policy calendar_reservations_delete_own on public.calendar_reservations
  for delete to authenticated
  using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 8. テーブル権限
--    RLS と併用するため、anon には一切の権限を与えない。
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;

grant select, update                 on public.profiles              to authenticated;
grant select, delete                 on public.invite_codes          to authenticated;
grant select, insert, update, delete on public.books                 to authenticated;
grant select, insert, update, delete on public.calendar_reservations to authenticated;
