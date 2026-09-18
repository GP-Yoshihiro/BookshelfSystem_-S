'use client';

import Link from 'next/link';
import { BookSpine } from './BookSpine';
import type { Book } from '@/types/database';

/** 1段の高さ（px）。棚板の周期もこの値に合わせる */
export const SHELF_ROW_HEIGHT_PX = 200;

/**
 * 木製本棚。
 *
 * 段数は画面幅で変わるため、棚板を段数ぶん手で並べることはできない。
 * グリッドの背景に1行の高さと同じ周期の繰り返しグラデーションを敷き、
 * 棚板が行数ぶん自動的に現れるようにしている。
 */
export function Bookshelf({
  books,
  activeId,
  onActivate,
  onHoverStart,
  onHoverEnd,
}: {
  books: readonly Book[];
  activeId: string | null;
  onActivate: (book: Book) => void;
  onHoverStart: (book: Book) => void;
  onHoverEnd: () => void;
}) {
  if (books.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 rounded bg-wood-800 bg-wood-grain p-10 text-center shadow-shelf"
        style={{ minHeight: `${SHELF_ROW_HEIGHT_PX}px` }}
      >
        <p className="text-wood-100">まだ本が登録されていません。</p>
        <Link
          href="/search"
          className="rounded bg-wood-600 px-4 py-2 text-sm font-medium text-wood-50 hover:bg-wood-700"
        >
          本を探す
        </Link>
      </div>
    );
  }

  return (
    <div
      className="rounded bg-wood-800 bg-wood-grain p-2 shadow-shelf"
      style={{
        // 棚板: 各行の下端に濃い木目の帯を敷く
        backgroundImage: [
          'repeating-linear-gradient(180deg,' +
            ' transparent 0,' +
            ` transparent ${SHELF_ROW_HEIGHT_PX - 14}px,` +
            ` rgba(0,0,0,0.45) ${SHELF_ROW_HEIGHT_PX - 14}px,` +
            ` rgba(0,0,0,0.20) ${SHELF_ROW_HEIGHT_PX - 6}px,` +
            ` transparent ${SHELF_ROW_HEIGHT_PX}px)`,
        ].join(','),
      }}
    >
      <ul
        className="grid justify-items-center gap-x-1"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))',
          gridAutoRows: `${SHELF_ROW_HEIGHT_PX}px`,
        }}
      >
        {books.map((book) => (
          <li key={book.id} className="flex h-full items-end pb-4">
            <BookSpine
              book={book}
              isActive={activeId === book.id}
              onActivate={onActivate}
              onHoverStart={onHoverStart}
              onHoverEnd={onHoverEnd}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
