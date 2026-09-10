-- =============================================================================
-- 招待コードの発行を管理者に限定する
--
-- 0001 の generate_invite_code は認証済みであれば誰でも実行でき、ロールを
-- 一切見ていなかった。そのため一般ユーザー（2人目以降）が自由に招待コードを
-- 発行でき、招待制の統制が効かない状態だった。
--
-- UI 側でも発行ボタンを出し分けるが、REST 経由で
-- /rest/v1/rpc/generate_invite_code を直接叩けば迂回できてしまうため、
-- 権限判定は関数の中で行うのが本丸となる。
-- =============================================================================

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

  -- 招待コードを発行できるのは管理者（1人目のユーザー）のみとする。
  -- is_admin() を使わず直接参照するのは、既に取得済みの v_uid を使え、
  -- auth.uid() の再評価を挟まないぶん判定が単純になるため。
  if not exists (
    select 1 from public.profiles
    where id = v_uid and role = 'admin'
  ) then
    raise exception '招待コードを発行する権限がありません。'
      using errcode = 'insufficient_privilege';
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
  '管理者が招待コードを発行する。管理者以外は insufficient_privilege で拒否される';

-- 実行権限は 0002 の状態（authenticated のみ）を維持する。
-- anon から実行できないことと、関数内の管理者チェックの二段構えで守る。
revoke all on function public.generate_invite_code(integer) from public, anon;
grant execute on function public.generate_invite_code(integer) to authenticated;
