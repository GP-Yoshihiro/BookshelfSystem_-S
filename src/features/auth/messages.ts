/**
 * Supabase のエラーを利用者向けの日本語文言へ変換する純粋関数群。
 *
 * エラーオブジェクトの内容には入力値やトークンの断片が含まれ得るため、
 * ここで変換した文言のみを画面表示・ログの対象とする（CLAUDE.md 2章）。
 */

/** validate_invite_code RPC が返す状態 */
export type InviteCodeStatus = 'ok' | 'not_found' | 'used' | 'expired';

export const INVITE_CODE_MESSAGES: Readonly<Record<InviteCodeStatus, string>> =
  {
    ok: '',
    not_found: '招待コードが正しくありません。',
    used: 'この招待コードは既に使用されています。',
    expired: 'この招待コードは有効期限が切れています。',
  };

const GENERIC_MESSAGE = '処理に失敗しました。時間をおいて再度お試しください。';

/** エラーらしきオブジェクトから message プロパティを安全に取り出す */
function extractMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message: unknown };
    if (typeof message === 'string') {
      return message;
    }
  }
  return '';
}

/**
 * ログイン失敗の文言。
 * 原因を問わず同一文言に統一し、アカウントの存在有無を推測させない。
 */
export function toAuthErrorMessage(error: unknown): string {
  const raw = extractMessage(error).toLowerCase();

  if (
    raw.includes('invalid login credentials') ||
    raw.includes('user not found') ||
    raw.includes('invalid credentials')
  ) {
    return 'メールアドレスまたはパスワードが正しくありません。';
  }
  return GENERIC_MESSAGE;
}

/** サインアップ失敗の文言 */
export function toSignUpErrorMessage(error: unknown): string {
  const raw = extractMessage(error).toLowerCase();

  if (raw.includes('already registered') || raw.includes('already exists')) {
    return 'このメールアドレスは既に登録されています。';
  }
  if (raw.includes('password should be at least')) {
    return 'パスワードは8文字以上で入力してください。';
  }
  // handle_new_user トリガが例外を送出すると Supabase Auth はこの文言に潰す。
  // 招待コードの競合（他者が先に使い切った等）が主な原因。
  if (raw.includes('database error saving new user')) {
    return '登録に失敗しました。招待コードをご確認のうえ、もう一度お試しください。';
  }
  return GENERIC_MESSAGE;
}
