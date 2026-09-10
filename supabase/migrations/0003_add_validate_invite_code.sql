-- =============================================================================
-- 招待コードの事前検証 RPC
--
-- auth.users のトリガ handle_new_user が例外を送出しても、Supabase Auth は
-- "Database error saving new user" (500) を返すのみで、RAISE EXCEPTION に
-- 書いた日本語メッセージはクライアントへ届かない。失敗の理由を利用者へ
-- 提示するため、signUp を呼ぶ前にこの関数で状態を判定する。
--
-- トリガは削除しない。事前検証と signUp の間に他者が同じコードを使い切る
-- 競合（TOCTOU）が起こり得るため、トリガが最終防波堤として機能する。
-- =============================================================================

create or replace function public.validate_invite_code(p_code text)
returns text
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_invite public.invite_codes%rowtype;
  v_code   text := nullif(trim(p_code), '');
begin
  if v_code is null then
    return 'not_found';
  end if;

  select * into v_invite
  from public.invite_codes
  where code = v_code;

  if not found then
    return 'not_found';
  end if;
  if v_invite.is_used then
    return 'used';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    return 'expired';
  end if;
  return 'ok';
end;
$$;

comment on function public.validate_invite_code(text) is
  '招待コードの状態を ok / not_found / used / expired で返す。サインアップ前の事前検証に使用する';

-- 状態を表す固定文字列のみを返し、発行者・発行日時・使用者は開示しない。
-- サインアップ前の未認証状態から呼ぶ関数のため、anon にのみ EXECUTE を与える。
revoke all on function public.validate_invite_code(text) from public, authenticated;
grant execute on function public.validate_invite_code(text) to anon;
