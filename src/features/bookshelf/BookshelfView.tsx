'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, type TouchEvent } from 'react';
import { Bookshelf } from './Bookshelf';
import { BookPreview } from './BookPreview';
import { BookshelfControls } from './BookshelfControls';
import {
  EMPTY_FILTERS,
  filterBooks,
  searchBooks,
  sortBooks,
  type BookFilters,
  type SortKey,
  type SortOrder,
} from './filters';
import type { Book } from '@/types/database';

/** スライドと判定する横移動の量（px） */
const SWIPE_THRESHOLD_PX = 40;

export function BookshelfView({ books }: { books: readonly Book[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [filters, setFilters] = useState<BookFilters>(EMPTY_FILTERS);
  const [activeId, setActiveId] = useState<string | null>(null);

  const touchStartXRef = useRef<number | null>(null);

  const visibleBooks = useMemo(() => {
    const searched = searchBooks(books, query);
    const filtered = filterBooks(searched, filters);
    return sortBooks(filtered, sortKey, sortOrder);
  }, [books, query, filters, sortKey, sortOrder]);

  const publishers = useMemo(
    () => [...new Set(books.map((book) => book.publisher))].sort(),
    [books],
  );

  const activeBook =
    visibleBooks.find((book) => book.id === activeId) ?? null;

  /**
   * 本を押したときの挙動。
   *
   * マウスでは押した時点で詳細へ遷移する。ホバーで既に概要を見ているため。
   * タッチではホバーがないので、1回目はプレビュー、プレビュー中の本を
   * もう一度押したときに遷移する。判定は「その本が今プレビュー中か」で行う。
   * スライドで移った先の本にも同じ規則が適用され、操作が一貫する。
   */
  function handleActivate(book: Book) {
    const canHover =
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover)').matches;

    if (canHover || activeId === book.id) {
      router.push(`/books/${book.id}`);
      return;
    }
    setActiveId(book.id);
  }

  function handleHoverStart(book: Book) {
    const canHover =
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover)').matches;
    if (canHover) {
      setActiveId(book.id);
    }
  }

  function handleHoverEnd() {
    const canHover =
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover)').matches;
    // タッチではプレビューを開いたままにする。閉じるのは明示操作のときだけ
    if (canHover) {
      setActiveId(null);
    }
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
  }

  /** プレビュー中に左右へスライドしたら、隣の本へ移る */
  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (startX === null || activeId === null) {
      return;
    }

    const endX = event.changedTouches[0]?.clientX;
    if (endX === undefined) {
      return;
    }

    const deltaX = endX - startX;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) {
      return;
    }

    const currentIndex = visibleBooks.findIndex((book) => book.id === activeId);
    if (currentIndex < 0) {
      return;
    }

    // 左へ払うと次の本、右へ払うと前の本
    const nextIndex = deltaX < 0 ? currentIndex + 1 : currentIndex - 1;
    const nextBook = visibleBooks[nextIndex];
    if (nextBook !== undefined) {
      setActiveId(nextBook.id);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-bold text-wood-50">本棚</h1>

      <BookshelfControls
        query={query}
        onQueryChange={setQuery}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        sortOrder={sortOrder}
        onSortOrderChange={setSortOrder}
        filters={filters}
        onFiltersChange={setFilters}
        publishers={publishers}
        shownCount={visibleBooks.length}
        totalCount={books.length}
      />

      <div
        className="relative"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <Bookshelf
          books={visibleBooks}
          activeId={activeId}
          onActivate={handleActivate}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
        />

        {activeBook !== null && (
          <BookPreview book={activeBook} onClose={() => setActiveId(null)} />
        )}
      </div>

      {books.length > 0 && visibleBooks.length === 0 && (
        <p role="status" className="text-sm text-wood-200">
          条件に一致する本がありません。検索語や絞り込みを見直してください。
        </p>
      )}
    </div>
  );
}
