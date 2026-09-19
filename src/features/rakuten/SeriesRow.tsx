'use client';

import Image from 'next/image';
import { useActionState, useEffect, useState } from 'react';
import { AlertButton } from '@/features/alerts/AlertButton';
import { saveBooksAction } from '@/features/books/bulkActions';
import { SAVE_BOOKS_INITIAL_STATE } from '@/features/books/bulkState';
import { speakComplete, speakError } from '@/lib/speech';
import {
  BOOK_CATEGORY_LABELS,
  ONGOING_CAPABLE_CATEGORIES,
} from '@/types/database';
import { estimateCategory, isOngoingByDefault, parseSalesDate } from './parse';
import type { SeriesGroup } from './grouping';

export function SeriesRow({
  group,
  ownedIsbns,
  alertIds,
}: {
  group: SeriesGroup;
  ownedIsbns: ReadonlySet<string>;
  /** series_key → alertId。解除に alertId が要るため Set ではなく Map */
  alertIds: ReadonlyMap<string, string>;
}) {
  const [state, formAction, isPending] = useActionState(
    saveBooksAction,
    SAVE_BOOKS_INITIAL_STATE,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<readonly string[]>([]);

  /*
    分類と連載中は楽天のデータから自動で決める。人が選び直せるようにすると、
    同じ作品の巻ごとに違う分類が付き、本棚の並びで別作品として分かれてしまう。
    分類は作品の同一性の判定に使っているため、揺れてはならない。
  */
  const category = estimateCategory(group.representative);

  useEffect(() => {
    if (state.successMessage.length > 0) {
      speakComplete();
    } else if (state.errorMessage.length > 0) {
      speakError();
    }
  }, [state.successMessage, state.errorMessage]);

  // 単行本は DB の制約により連載中を持てないため、分類に応じて落とす
  const effectiveIsOngoing =
    ONGOING_CAPABLE_CATEGORIES.includes(category) &&
    isOngoingByDefault(group.representative.seriesName, category);

  const latestSales =
    group.latest === null ? null : parseSalesDate(group.latest.item.salesDate);

  const selectableEntries = group.entries.filter(
    (entry) => !ownedIsbns.has(entry.item.isbn),
  );

  function toggle(isbn: string) {
    setSelected((current) =>
      current.includes(isbn)
        ? current.filter((value) => value !== isbn)
        : [...current, isbn],
    );
  }

  function selectAll() {
    setSelected(selectableEntries.map((entry) => entry.item.isbn));
  }

  /** 選んだ巻を Server Action へ渡す形へ整える */
  const selectedPayload = group.entries
    .filter((entry) => selected.includes(entry.item.isbn))
    .map((entry) => {
      const sales = parseSalesDate(entry.item.salesDate);
      return {
        isbn: entry.item.isbn,
        title: entry.item.title,
        titleKana: entry.item.titleKana,
        author: entry.item.author,
        publisher: entry.item.publisherName,
        coverImageUrl: entry.item.largeImageUrl,
        description: entry.item.itemCaption,
        releaseDate: sales.date ?? '',
        releaseDateText: sales.text,
        itemUrl: entry.item.itemUrl,
      };
    });

  return (
    <li className="rounded bg-wood-800 p-3 shadow-book">
      <div className="flex gap-4">
        {group.representative.largeImageUrl.length > 0 && (
          <Image
            src={group.representative.largeImageUrl}
            alt=""
            width={80}
            height={112}
            unoptimized
            className="h-28 w-20 flex-none object-contain"
          />
        )}

        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-bold text-wood-50">{group.title}</p>
          <p className="text-sm text-wood-200">
            {group.representative.author}／{group.representative.publisherName}
          </p>

          {group.latest !== null && (
            <p className="text-sm text-wood-300">
              取得 {group.entries.length} 巻（最新 {group.latest.volume} 巻
              {latestSales !== null && latestSales.text.length > 0
                ? `・${latestSales.text} 発売`
                : ''}
              ）
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {/* 自動で決めた内容は、変更できなくても見えるようにしておく */}
            <p className="text-sm text-wood-200">
              分類 {BOOK_CATEGORY_LABELS[category]}
              {effectiveIsOngoing && '／連載中'}
            </p>

            <button
              type="button"
              onClick={() => setIsOpen((current) => !current)}
              aria-expanded={isOpen}
              className="rounded bg-wood-600 px-3 py-1 text-sm font-medium text-wood-50 hover:bg-wood-700"
            >
              {isOpen ? '巻を閉じる' : '巻を選んで追加'}
            </button>

            {/* 続きが出ない単独商品と、最新巻を特定できない作品には出さない。
                通知は「次の巻」を追うための機能であるため */}
            {!group.isSingle && group.latest !== null && (
              <AlertButton
                group={group}
                alertId={alertIds.get(group.key) ?? null}
              />
            )}
          </div>

          {state.errorMessage.length > 0 && (
            <p role="alert" className="text-sm text-red-300">
              {state.errorMessage}
            </p>
          )}
          {state.successMessage.length > 0 && (
            <p role="status" className="text-sm text-wood-100">
              {state.successMessage}
            </p>
          )}
        </div>
      </div>

      {isOpen && (
        <form action={formAction} className="mt-3 space-y-2 border-t border-wood-700 pt-3">
          <input
            type="hidden"
            name="books"
            value={JSON.stringify(selectedPayload)}
          />
          <input type="hidden" name="category" value={category} />
          <input
            type="hidden"
            name="isOngoing"
            value={effectiveIsOngoing ? 'true' : 'false'}
          />

          <div className="flex items-center justify-between">
            <p className="text-sm text-wood-200">
              追加する巻を選んでください（{selected.length} 件選択中）
            </p>
            <button
              type="button"
              onClick={selectAll}
              disabled={selectableEntries.length === 0}
              className="text-sm text-wood-200 underline disabled:opacity-50"
            >
              未所有をすべて選ぶ
            </button>
          </div>

          <ul className="grid gap-1 sm:grid-cols-2">
            {group.entries.map((entry) => {
              const owned = ownedIsbns.has(entry.item.isbn);
              return (
                <li key={entry.item.isbn}>
                  <label
                    className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${
                      owned ? 'text-wood-400' : 'text-wood-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(entry.item.isbn)}
                      disabled={owned}
                      onChange={() => toggle(entry.item.isbn)}
                    />
                    <span className="truncate">
                      {entry.volume === null
                        ? entry.item.title
                        : `${entry.volume} 巻`}
                    </span>
                    {owned && <span className="flex-none">追加済み</span>}
                  </label>
                </li>
              );
            })}
          </ul>

          {/* 保存できるのは購入済みのみ。理由は SaveBookForm と同じ */}
          <input type="hidden" name="isPurchased" value="true" />

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending || selected.length === 0}
              className="rounded bg-wood-600 px-3 py-1 text-sm font-medium text-wood-50 hover:bg-wood-700 disabled:opacity-60"
            >
              選んだ巻を購入済みとして追加
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
