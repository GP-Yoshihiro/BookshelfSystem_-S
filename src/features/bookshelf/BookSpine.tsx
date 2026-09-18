'use client';

import { spineStyle } from './spine';
import type { Book } from '@/types/database';

/**
 * 背表紙1冊。
 *
 * 楽天は背表紙画像を提供しないため CSS で描く。タイトルは縦書きにする。
 * 日本語書籍に自然で、幅の狭い背表紙にも収まるため。
 */
export function BookSpine({
  book,
  isActive,
  onActivate,
  onHoverStart,
  onHoverEnd,
}: {
  book: Book;
  isActive: boolean;
  onActivate: (book: Book) => void;
  onHoverStart: (book: Book) => void;
  onHoverEnd: () => void;
}) {
  const { hue, widthPx } = spineStyle(book.isbn);

  return (
    <button
      type="button"
      data-book-id={book.id}
      aria-label={`${book.title}（${book.author}）`}
      aria-pressed={isActive}
      onClick={() => onActivate(book)}
      onMouseEnter={() => onHoverStart(book)}
      onMouseLeave={onHoverEnd}
      onFocus={() => onHoverStart(book)}
      onBlur={onHoverEnd}
      style={{
        width: `${widthPx}px`,
        // 彩度と明度は固定する。木目の背景から浮きすぎないため
        backgroundColor: `hsl(${hue} 42% 38%)`,
        borderColor: `hsl(${hue} 42% 26%)`,
      }}
      className={`relative h-44 shrink-0 self-end rounded-sm border-x-2 shadow-book transition-transform duration-150 ${
        isActive ? '-translate-y-3' : 'hover:-translate-y-2'
      }`}
    >
      {/* 左右のハイライトで丸みを出す */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-sm bg-gradient-to-r from-white/25 via-transparent to-black/30"
      />
      {/* 上下の帯で装丁らしさを出す */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-2 h-1 bg-white/25"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-2 h-1 bg-white/25"
      />
      <span
        className="absolute inset-0 flex items-start justify-center overflow-hidden px-1 pt-4 text-xs leading-tight text-white"
        style={{ writingMode: 'vertical-rl', textOrientation: 'upright' }}
      >
        <span className="truncate">{book.title}</span>
      </span>
    </button>
  );
}
