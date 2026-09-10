-- =============================================================================
-- 初回登録特例の競合状態 (race condition) 修正
--
-- 問題:
--   handle_new_user 内の「既存ユーザーの有無」判定
--     select not exists (select 1 from public.profiles where id <> new.id)
--   にはロックがなかった。招待コード検証側は `for update` で行ロックを取得し
--   TOCTOU 対策済みだったが、この判定だけが無防備だった。
--
--   PostgreSQL の READ COMMITTED 分離レベルでは、他トランザクションが
--   コミットするまでその変更（INSERT 含む）は見えない。そのため、
--   ユーザーが0人の状態でサインアップ要求が2件ほぼ同時に発生すると、
--   トランザクション A・B は互いの未コミットの INSERT を見られず、
--   両方が「既存ユーザーなし」と判定してしまう。結果として両方が
--   招待コードなし・role='admin' で登録され、招待制の前提が破られる。
--
-- 対応:
--   既存ユーザー有無の判定の直前で pg_advisory_xact_lock を取得し、
--   この判定〜プロフィール作成までを直列化する。トランザクション単位の
--   アドバイザリロックはトランザクション終了時（COMMIT/ROLLBACK）に
--   自動解放されるため解放漏れがなく、対象は「初回判定」という論理単位
--   のみでテーブル全体やもっと広い範囲をロックするより影響が小さい。
--
--   ロックキーは固定文字列
--     'bookshelf_system.handle_new_user.first_user_lock'
--   を hashtextextended() で bigint 化した値を使う。手打ちの定数を
--   複数箇所で管理して衝突させてしまうリスクを避けつつ、この文字列を
--   見れば何のためのロックかが分かるようにするため。
--
--   招待コードの検証ロジック・profiles への INSERT 内容・招待コードを
--   使用済みへ更新する処理・例外メッセージは 0001 から一切変更していない。
--   差分はこのロック取得の追加のみ。
--
--   トリガ (on_auth_user_created) はそのまま。関数本体を
--   create or replace function で差し替えれば新しい定義がトリガから
--   呼ばれるため、トリガ自体の再作成は不要。
-- =============================================================================

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
  -- 初回登録特例の判定を直列化するためのアドバイザリロック。
  -- READ COMMITTED では他トランザクションの未コミット行が見えないため、
  -- このロックなしでは同時サインアップにより複数人が「1人目」と
  -- 判定されうる。トランザクション終了時に自動解放される。
  perform pg_advisory_xact_lock(
    hashtextextended('bookshelf_system.handle_new_user.first_user_lock', 0)
  );

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
