'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { deleteBookAction } from './actions';
import { DELETE_BOOK_INITIAL_STATE } from './state';
import { speakComplete, speakError } from '@/lib/speech';

/**
 * 本棚から書籍を削除するボタン。確認ダイアログを内蔵する。
 *
 * 削除すると元に戻せず、再度検索して登録し直す必要があるため、
 * 必ず確認を挟む。何を消そうとしているか分かるよう書名を示す。
 *
 * 詳細ページとプレビューの両方から使う。同じ確認体験を2箇所へ
 * 書き分けると、片方だけ直してしまう事故が起きるため1つにまとめている。
 */
export function DeleteBookButton({
  bookId,
  title,
  redirectTo,
}: {
  bookId: string;
  title: string;
  /** 削除後に移動する先。指定しなければその場で再読み込みする */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    deleteBookAction,
    DELETE_BOOK_INITIAL_STATE,
  );
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    if (state.deletedId.length > 0) {
      speakComplete('本棚から削除しました。');
      if (redirectTo === undefined) {
        router.refresh();
      } else {
        router.push(redirectTo);
      }
      return;
    }
    if (state.errorMessage.length > 0) {
      speakError();
    }
  }, [state.deletedId, state.errorMessage, redirectTo, router]);

  if (!isConfirming) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => setIsConfirming(true)}
          className="text-sm text-red-300 underline"
        >
          本棚から削除
        </button>
        {state.errorMessage.length > 0 && (
          <p role="alert" className="text-sm text-red-300">
            {state.errorMessage}
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2 rounded bg-wood-900 p-3">
      <input type="hidden" name="bookId" value={bookId} />
      <p className="text-sm text-wood-100">
        「{title}」を本棚から削除します。元に戻せません。
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setIsConfirming(false)}
          className="rounded border border-wood-400 px-3 py-1 text-sm text-wood-100"
        >
          やめる
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-red-800 px-3 py-1 text-sm font-medium text-wood-50 hover:bg-red-700 disabled:opacity-60"
        >
          {isPending ? '削除中…' : '削除する'}
        </button>
      </div>
    </form>
  );
}
