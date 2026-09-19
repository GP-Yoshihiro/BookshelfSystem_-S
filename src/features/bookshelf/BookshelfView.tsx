'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import { Bookshelf } from './Bookshelf';
import { BookPreview } from './BookPreview';
import { BookshelfControls } from './BookshelfControls';
import { publisherSortKey } from './publisher';
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
  const shelfAreaRef = useRef<HTMLDivElement | null>(null);

  const visibleBooks = useMemo(() => {
    const searched = searchBooks(books, query);
    const filtered = filterBooks(searched, filters);
    return sortBooks(filtered, sortKey, sortOrder);
  }, [books, query, filters, sortKey, sortOrder]);

  // 絞り込みタグも並び替えと同じ五十音順にする。片方だけ別の順だと
  // 目的の出版社を探すときに手間取る
  const publishers = useMemo(
    () =>
      [...new Set(books.map((book) => book.publisher))].sort((left, right) =>
        publisherSortKey(left).localeCompare(publisherSortKey(right), 'ja'),
      ),
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

  /**
   * プレビュー表示中のみ、本棚とプレビューパネルの外側をタップ/クリックしたら
   * プレビューを閉じる。本自身へのタップは同じ領域内なので、ここでは反応しない
   * （本を開いた瞬間に閉じてしまう競合を避けられる）。
   *
   * click ではなく pointerdown で判定する。click だと、押されたボタンが
   * React の再描画で差し替わったあとに外側判定が走ることがあり、押した要素が
   * 既に DOM から外れているため contains() が false になって「外側を押した」と
   * 誤判定する。プレビュー内の削除ボタンを押すとプレビューごと閉じてしまう
   * 不具合が実際に起きた。pointerdown なら DOM が変わる前に判定できる。
   */
  useEffect(() => {
    if (activeId === null) {
      return;
    }

    function handleOutsidePointerDown(event: PointerEvent) {
      const area = shelfAreaRef.current;
      if (area === null) {
        return;
      }
      if (event.target instanceof Node && area.contains(event.target)) {
        return;
      }
      setActiveId(null);
    }

    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown);
    };
  }, [activeId]);

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

      {/*
        広い画面ではプレビュー用の列をあらかじめ確保し、本棚と横に並べる。
        以前はプレビューを本棚へ絶対配置で重ねていたため、パネルの下に本が
        並んでしまい、その本にホバーすると出てきたパネル自身が本を覆って
        mouseleave が発火し、ちらついて操作できなかった。
        列を常に確保することで、プレビューの開閉によって本の並びが変わることも
        なくなり、ホバーの当たり判定と見た目が常に一致する。
      */}
      <div
        ref={shelfAreaRef}
        className="md:flex md:items-start md:gap-4"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="min-w-0 md:flex-1">
          <Bookshelf
            books={visibleBooks}
            activeId={activeId}
            onActivate={handleActivate}
            onHoverStart={handleHoverStart}
            onHoverEnd={handleHoverEnd}
          />

          {/*
            狭い画面ではプレビューが画面下部へ固定表示されるため、
            最下段の本がその裏に隠れて選べなくなる。開いている間だけ
            下に余白を作って、最下段までスクロールできるようにする。

            高さは BookPreview の max-h-[70vh] と揃える。小さいと
            最下段の本をパネルの上まで送り出せず、隠れたままになる。
          */}
          {activeBook !== null && (
            <div aria-hidden="true" className="h-[70vh] md:hidden" />
          )}
        </div>

        <div className="md:sticky md:top-4 md:w-80 md:flex-none">
          {activeBook !== null ? (
            <BookPreview book={activeBook} onClose={() => setActiveId(null)} />
          ) : (
            <p className="hidden rounded bg-wood-800 p-4 text-sm text-wood-300 md:block">
              本にカーソルを合わせると、表紙と概要がここに表示されます。
            </p>
          )}
        </div>
      </div>

      {books.length > 0 && visibleBooks.length === 0 && (
        <p role="status" className="text-sm text-wood-200">
          条件に一致する本がありません。検索語や絞り込みを見直してください。
        </p>
      )}
    </div>
  );
}
