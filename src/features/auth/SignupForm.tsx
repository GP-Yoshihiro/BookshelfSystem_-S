'use client';

import { useActionState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { signUpAction } from './actions';
import { AUTH_INITIAL_STATE } from './state';
import { speakError } from '@/lib/speech';

export function SignupForm({
  requiresInviteCode,
}: {
  requiresInviteCode: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    signUpAction,
    AUTH_INITIAL_STATE,
  );
  const previousError = useRef('');

  // 失敗時のみ音声案内を鳴らす。成功時は redirect されるため到達しない。
  useEffect(() => {
    if (
      state.errorMessage.length > 0 &&
      state.errorMessage !== previousError.current
    ) {
      speakError();
    }
    previousError.current = state.errorMessage;
  }, [state.errorMessage]);

  return (
    <form action={formAction} className="space-y-4">
      {!requiresInviteCode && (
        <p className="rounded bg-wood-100 p-3 text-sm text-wood-800">
          最初のユーザー登録です。招待コードは不要で、管理者として登録されます。
        </p>
      )}

      <div>
        <label
          htmlFor="displayName"
          className="block text-sm font-medium text-wood-800"
        >
          表示名
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="nickname"
          className="mt-1 w-full rounded border border-wood-300 px-3 py-2 text-wood-900"
        />
      </div>

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-wood-800"
        >
          メールアドレス
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-1 w-full rounded border border-wood-300 px-3 py-2 text-wood-900"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-wood-800"
        >
          パスワード
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="mt-1 w-full rounded border border-wood-300 px-3 py-2 text-wood-900"
        />
        <p className="mt-1 text-xs text-wood-600">8文字以上で入力してください</p>
      </div>

      {requiresInviteCode && (
        <div>
          <label
            htmlFor="inviteCode"
            className="block text-sm font-medium text-wood-800"
          >
            招待コード
          </label>
          <input
            id="inviteCode"
            name="inviteCode"
            type="text"
            required
            className="mt-1 w-full rounded border border-wood-300 px-3 py-2 font-mono tracking-wider text-wood-900"
          />
        </div>
      )}

      {state.errorMessage.length > 0 && (
        <p role="alert" className="text-sm text-red-700">
          {state.errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded bg-wood-600 py-2 font-medium text-wood-50 hover:bg-wood-700 disabled:opacity-60"
      >
        {isPending ? '登録中…' : '登録する'}
      </button>

      <p className="text-center text-sm text-wood-700">
        既にアカウントをお持ちの方は{' '}
        <Link href="/login" className="underline">
          ログイン
        </Link>
      </p>
    </form>
  );
}
