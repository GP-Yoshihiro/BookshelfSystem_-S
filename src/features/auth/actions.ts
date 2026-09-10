'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  toAuthErrorMessage,
  toSignUpErrorMessage,
  INVITE_CODE_MESSAGES,
  type InviteCodeStatus,
} from './messages';

export interface AuthFormState {
  errorMessage: string;
}

// 'use server' ファイルの全エクスポートは Server Reference として扱われるため、
// 値のエクスポート（AUTH_INITIAL_STATE）はここに置けない。
// 型 (AuthFormState) はコンパイル時に消去されるため問題ないが、
// 値は ./state.ts に分離し、そちらから import すること。

/** FormData から文字列を取り出す。未入力・型違いは空文字とする */
function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export async function signInAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readString(formData, 'email');
  // パスワードは trim しない。前後の空白も本人が設定した文字の一部でありうる。
  const passwordValue = formData.get('password');
  const password = typeof passwordValue === 'string' ? passwordValue : '';

  if (email.length === 0 || password.length === 0) {
    return { errorMessage: 'メールアドレスとパスワードを入力してください。' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { errorMessage: toAuthErrorMessage(error) };
  }

  // redirect() は例外を投げて制御を移すため、try/catch の外で呼ぶ
  redirect('/');
}

export async function signUpAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readString(formData, 'email');
  const displayName = readString(formData, 'displayName');
  const inviteCode = readString(formData, 'inviteCode');
  const passwordValue = formData.get('password');
  const password = typeof passwordValue === 'string' ? passwordValue : '';

  if (email.length === 0 || password.length === 0) {
    return { errorMessage: 'メールアドレスとパスワードを入力してください。' };
  }
  if (password.length < 8) {
    return { errorMessage: 'パスワードは8文字以上で入力してください。' };
  }

  const supabase = await createClient();

  // 既存ユーザーの有無で招待コードの要否が変わる
  const { data: hasAnyUser, error: hasAnyUserError } =
    await supabase.rpc('has_any_user');

  if (hasAnyUserError) {
    return {
      errorMessage: '処理に失敗しました。時間をおいて再度お試しください。',
    };
  }

  if (hasAnyUser === true) {
    if (inviteCode.length === 0) {
      return { errorMessage: '招待コードを入力してください。' };
    }

    // トリガの例外メッセージはクライアントへ届かないため、ここで理由を判定する
    const { data: status, error: validateError } = await supabase.rpc(
      'validate_invite_code',
      { p_code: inviteCode },
    );

    if (validateError) {
      return {
        errorMessage: '処理に失敗しました。時間をおいて再度お試しください。',
      };
    }
    if (status !== 'ok') {
      return {
        errorMessage: INVITE_CODE_MESSAGES[status as InviteCodeStatus],
      };
    }
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        invite_code: inviteCode,
        display_name: displayName,
      },
    },
  });

  if (error) {
    return { errorMessage: toSignUpErrorMessage(error) };
  }

  redirect('/');
}

export async function signOutAction(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
