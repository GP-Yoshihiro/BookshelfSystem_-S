'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signInAction } from './actions';
import { AUTH_INITIAL_STATE } from './state';

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(
    signInAction,
    AUTH_INITIAL_STATE,
  );

  return (
    <form action={formAction} className="space-y-4">
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
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded border border-wood-300 px-3 py-2 text-wood-900"
        />
      </div>

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
        {isPending ? 'ログイン中…' : 'ログイン'}
      </button>

      <p className="text-center text-sm text-wood-700">
        アカウントをお持ちでない方は{' '}
        <Link href="/signup" className="underline">
          新規登録
        </Link>
      </p>
    </form>
  );
}
