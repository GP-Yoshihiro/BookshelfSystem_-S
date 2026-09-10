'use client';

import { useActionState, useState } from 'react';
import { useReauth } from '@/features/auth/useReauth';
import { speakComplete, speakError } from '@/lib/speech';
import { deleteInviteCodeAction } from './actions';
import { INVITE_INITIAL_STATE } from './state';
import { formatExpiry } from './format';
import type { InviteCode } from '@/types/database';

/**
 * コードを伏せ字にする。
 *
 * これは描画時の処理に過ぎない。Server Component から props として渡された
 * 時点で、コードの平文は RSC ペイロードとしてブラウザへ届いている。
 * 再認証は「離席した画面での覗き見」を防ぐ UI ガードであり、
 * DevTools を開ける相手からコードを秘匿するものではない。
 * 詳細と、この判断を見直すべき条件は設計書 8-2 章を参照。
 */
function maskCode(code: string): string {
  return '•'.repeat(code.length);
}

export function InviteCodeList({ codes }: { codes: readonly InviteCode[] }) {
  const [state, formAction] = useActionState(
    deleteInviteCodeAction,
    INVITE_INITIAL_STATE,
  );
  const [revealedIds, setRevealedIds] = useState<readonly string[]>([]);
  const [copiedId, setCopiedId] = useState('');
  // クリップボードへの書き込み失敗（権限拒否・非セキュアコンテキスト等）を
  // 利用者へ伝えるためのメッセージ。requireReauth の action が reject しても
  // 呼び出し元（このコンポーネント）が握りつぶさず表示する責務を負う。
  const [copyErrorMessage, setCopyErrorMessage] = useState('');
  const { requireReauth } = useReauth();
  const now = new Date();

  function handleReveal(id: string) {
    requireReauth(() => {
      setRevealedIds((previous) => [...previous, id]);
    });
  }

  function handleCopy(id: string, code: string) {
    requireReauth(async () => {
      try {
        await navigator.clipboard.writeText(code);
        setCopyErrorMessage('');
        setCopiedId(id);
        speakComplete('招待コードをコピーしました。');
      } catch {
        // クリップボード API の失敗理由（権限拒否等）は表示しない
        setCopyErrorMessage('招待コードのコピーに失敗しました。');
        speakError();
      }
    });
  }

  if (codes.length === 0) {
    return (
      <p className="text-sm text-wood-200">
        発行済みの招待コードはありません。
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {state.errorMessage.length > 0 && (
        <p role="alert" className="text-sm text-red-300">
          {state.errorMessage}
        </p>
      )}

      {copyErrorMessage.length > 0 && (
        <p role="alert" className="text-sm text-red-300">
          {copyErrorMessage}
        </p>
      )}

      <ul className="space-y-2">
        {codes.map((invite) => {
          const isRevealed = revealedIds.includes(invite.id);
          return (
            <li
              key={invite.id}
              className="flex flex-wrap items-center gap-3 rounded bg-wood-50 p-3 shadow-book"
            >
              <code className="font-mono tracking-wider text-wood-900">
                {isRevealed ? invite.code : maskCode(invite.code)}
              </code>

              <span className="text-sm text-wood-700">
                {invite.is_used
                  ? '使用済み'
                  : formatExpiry(invite.expires_at, now)}
              </span>

              {!isRevealed && (
                <button
                  type="button"
                  onClick={() => handleReveal(invite.id)}
                  className="text-sm text-wood-700 underline"
                >
                  表示
                </button>
              )}

              <button
                type="button"
                onClick={() => handleCopy(invite.id, invite.code)}
                className="text-sm text-wood-700 underline"
              >
                {copiedId === invite.id ? 'コピー済み' : 'コピー'}
              </button>

              {!invite.is_used && (
                <form action={formAction} className="ml-auto">
                  <input type="hidden" name="id" value={invite.id} />
                  <button
                    type="submit"
                    className="text-sm text-red-700 underline"
                  >
                    削除
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
