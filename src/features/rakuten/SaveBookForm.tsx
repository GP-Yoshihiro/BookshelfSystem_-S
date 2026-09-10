'use client';

import { useActionState, useEffect, useState } from 'react';
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

const CATEGORY_VALUES: readonly BookCategory[] = [
  'tankobon',
  'series_tankobon',
  'light_novel',
  'comic',
];

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
  const [category, setCategory] = useState<BookCategory>(
    values.defaultCategory,
  );
  const [isOngoing, setIsOngoing] = useState(values.defaultIsOngoing);

  useEffect(() => {
    if (state.successMessage.length > 0) {
      speakComplete();
    } else if (state.errorMessage.length > 0) {
      speakError();
    }
  }, [state.successMessage, state.errorMessage]);

  // 単行本は DB の制約により連載中を持てないため、選び直したら落とす
  const canBeOngoing = ONGOING_CAPABLE_CATEGORIES.includes(category);
  const effectiveIsOngoing = canBeOngoing && isOngoing;

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

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-wood-200">
          分類
          <select
            name="category"
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as BookCategory)
            }
            className="ml-2 rounded border border-wood-300 bg-wood-50 px-2 py-1 text-wood-900"
          >
            {CATEGORY_VALUES.map((value) => (
              <option key={value} value={value}>
                {BOOK_CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1 text-sm text-wood-200">
          <input
            type="checkbox"
            checked={effectiveIsOngoing}
            disabled={!canBeOngoing}
            onChange={(event) => setIsOngoing(event.target.checked)}
          />
          連載中
        </label>
      </div>

      {state.errorMessage.length > 0 && (
        <p role="alert" className="text-sm text-red-300">
          {state.errorMessage}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          name="isPurchased"
          value="false"
          disabled={isPending}
          className="rounded border border-wood-400 px-3 py-1 text-sm text-wood-100 disabled:opacity-60"
        >
          本棚に追加
        </button>
        <button
          type="submit"
          name="isPurchased"
          value="true"
          disabled={isPending}
          className="rounded bg-wood-600 px-3 py-1 text-sm font-medium text-wood-50 hover:bg-wood-700 disabled:opacity-60"
        >
          購入済みとして追加
        </button>
      </div>
    </form>
  );
}
