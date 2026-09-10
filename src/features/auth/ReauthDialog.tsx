'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useReauth } from './useReauth';
import { speakReauth } from '@/lib/speech';

export function ReauthDialog() {
  const { isDialogOpen, errorMessage, isVerifying, submitPassword, cancel } =
    useReauth();
  const [password, setPassword] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // ダイアログを開いた瞬間に音声案内を鳴らし、入力欄へフォーカスする
  useEffect(() => {
    if (isDialogOpen) {
      speakReauth();
      inputRef.current?.focus();
    } else {
      setPassword('');
    }
  }, [isDialogOpen]);

  if (!isDialogOpen) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entered = password;
    // 検証呼び出しの直後に state から破棄する
    setPassword('');
    await submitPassword(entered);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reauth-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-sm rounded-lg bg-wood-50 p-6 shadow-book">
        <h2 id="reauth-title" className="mb-2 text-lg font-bold text-wood-900">
          パスワードの再認証
        </h2>
        <p className="mb-4 text-sm text-wood-700">
          セキュリティ保護のため、パスワードを再入力してください。
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            ref={inputRef}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="w-full rounded border border-wood-300 px-3 py-2 text-wood-900"
          />

          {errorMessage.length > 0 && (
            <p role="alert" className="text-sm text-red-700">
              {errorMessage}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={cancel}
              className="flex-1 rounded border border-wood-400 py-2 text-wood-800"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isVerifying}
              className="flex-1 rounded bg-wood-600 py-2 font-medium text-wood-50 hover:bg-wood-700 disabled:opacity-60"
            >
              {isVerifying ? '確認中…' : '確認'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
