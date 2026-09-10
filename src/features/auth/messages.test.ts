import { describe, it, expect } from 'vitest';
import {
  toAuthErrorMessage,
  toSignUpErrorMessage,
  INVITE_CODE_MESSAGES,
} from './messages';

describe('toAuthErrorMessage', () => {
  it('認証情報の誤りを統一文言へ変換する', () => {
    const error = { message: 'Invalid login credentials' };
    expect(toAuthErrorMessage(error)).toBe(
      'メールアドレスまたはパスワードが正しくありません。',
    );
  });

  it('ユーザーが存在しない場合も同じ文言にしてアカウント列挙を防ぐ', () => {
    const error = { message: 'User not found' };
    expect(toAuthErrorMessage(error)).toBe(
      'メールアドレスまたはパスワードが正しくありません。',
    );
  });

  it('想定外のエラーは汎用文言へ変換する', () => {
    expect(toAuthErrorMessage(new Error('network timeout'))).toBe(
      '処理に失敗しました。時間をおいて再度お試しください。',
    );
  });

  it('null や undefined でも例外を投げない', () => {
    expect(toAuthErrorMessage(null)).toBe(
      '処理に失敗しました。時間をおいて再度お試しください。',
    );
  });

  it('元のエラー文字列を含めない', () => {
    const message = toAuthErrorMessage({ message: 'secret-token-abc123' });
    expect(message).not.toContain('secret-token-abc123');
  });
});

describe('toSignUpErrorMessage', () => {
  it('登録済みメールアドレスを専用文言へ変換する', () => {
    const error = { message: 'User already registered' };
    expect(toSignUpErrorMessage(error)).toBe(
      'このメールアドレスは既に登録されています。',
    );
  });

  it('パスワードが短い場合を専用文言へ変換する', () => {
    const error = { message: 'Password should be at least 6 characters' };
    expect(toSignUpErrorMessage(error)).toBe(
      'パスワードは8文字以上で入力してください。',
    );
  });

  it('トリガ由来の 500 を招待コードの案内へ変換する', () => {
    const error = { message: 'Database error saving new user' };
    expect(toSignUpErrorMessage(error)).toBe(
      '登録に失敗しました。招待コードをご確認のうえ、もう一度お試しください。',
    );
  });

  it('想定外のエラーは汎用文言へ変換する', () => {
    expect(toSignUpErrorMessage({ message: 'something odd' })).toBe(
      '処理に失敗しました。時間をおいて再度お試しください。',
    );
  });
});

describe('INVITE_CODE_MESSAGES', () => {
  it('各状態に対応する日本語文言を持つ', () => {
    expect(INVITE_CODE_MESSAGES.not_found).toBe(
      '招待コードが正しくありません。',
    );
    expect(INVITE_CODE_MESSAGES.used).toBe(
      'この招待コードは既に使用されています。',
    );
    expect(INVITE_CODE_MESSAGES.expired).toBe(
      'この招待コードは有効期限が切れています。',
    );
    expect(INVITE_CODE_MESSAGES.ok).toBe('');
  });
});
