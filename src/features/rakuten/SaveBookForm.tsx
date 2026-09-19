'use client';

import { useActionState, useEffect } from 'react';
import { saveBookAction } from '@/features/books/actions';
import { SAVE_BOOK_INITIAL_STATE } from '@/features/books/state';
import { speakComplete, speakError } from '@/lib/speech';
import {
  BOOK_CATEGORY_LABELS,
  ONGOING_CAPABLE_CATEGORIES,
  type BookCategory,
} from '@/types/database';

export interface SaveBookFormValues {
  isbn: string;
  title: string;
  titleKana: string;
  author: string;
  publisher: string;
  coverImageUrl: string;
  description: string;
  releaseDate: string;
  releaseDateText: string;
  itemUrl: string;
  defaultCategory: BookCategory;
  defaultIsOngoing: boolean;
}

export function SaveBookForm({
  values,
  alreadyOwned,
}: {
  values: SaveBookFormValues;
  alreadyOwned: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    saveBookAction,
    SAVE_BOOK_INITIAL_STATE,
  );
  /*
    分類と連載中は楽天のデータから自動で決める。人が選び直せるようにすると、
    同じ作品の巻ごとに違う分類が付き、本棚の並びで別作品として分かれてしまう。
    分類は作品の同一性の判定に使っているため、揺れてはならない。
  */
  const category = values.defaultCategory;

  useEffect(() => {
    if (state.successMessage.length > 0) {
      speakComplete();
    } else if (state.errorMessage.length > 0) {
      speakError();
    }
  }, [state.successMessage, state.errorMessage]);

  // 単行本は DB の制約により連載中を持てないため、分類に応じて落とす
  const effectiveIsOngoing =
    ONGOING_CAPABLE_CATEGORIES.includes(category) && values.defaultIsOngoing;

  if (alreadyOwned) {
    return (
      <p className="text-sm text-wood-300">この本は本棚に追加済みです。</p>
    );
  }

  if (state.successMessage.length > 0) {
    return (
      <p role="status" className="text-sm text-wood-100">
        {state.successMessage}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="isbn" value={values.isbn} />
      <input type="hidden" name="title" value={values.title} />
      <input type="hidden" name="titleKana" value={values.titleKana} />
      <input type="hidden" name="author" value={values.author} />
      <input type="hidden" name="publisher" value={values.publisher} />
      <input type="hidden" name="coverImageUrl" value={values.coverImageUrl} />
      <input type="hidden" name="description" value={values.description} />
      <input type="hidden" name="releaseDate" value={values.releaseDate} />
      <input
        type="hidden"
        name="releaseDateText"
        value={values.releaseDateText}
      />
      <input type="hidden" name="itemUrl" value={values.itemUrl} />
      <input
        type="hidden"
        name="isOngoing"
        value={effectiveIsOngoing ? 'true' : 'false'}
      />

      <input type="hidden" name="category" value={category} />

      {/* 自動で決めた内容は、変更できなくても見えるようにしておく */}
      <p className="text-sm text-wood-200">
        分類 {BOOK_CATEGORY_LABELS[category]}
        {effectiveIsOngoing && '／連載中'}
      </p>

      {state.errorMessage.length > 0 && (
        <p role="alert" className="text-sm text-red-300">
          {state.errorMessage}
        </p>
      )}

      {/*
        保存できるのは購入済みのみになったため、値は hidden で固定する。
        submit ボタンの name/value で送ると、submitter を伴わない送信が
        起きたときに黙って未購入で保存され、本棚に出ない本ができてしまう。
      */}
      <input type="hidden" name="isPurchased" value="true" />

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-wood-600 px-3 py-1 text-sm font-medium text-wood-50 hover:bg-wood-700 disabled:opacity-60"
        >
          購入済みとして追加
        </button>
      </div>
    </form>
  );
}
