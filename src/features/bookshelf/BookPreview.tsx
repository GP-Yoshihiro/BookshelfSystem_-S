'use client';

import Image from 'next/image';
import Link from 'next/link';
import { BOOK_CATEGORY_LABELS, type Book } from '@/types/database';

/**
 * 表紙と概要を見せるパネル。
 *
 * 背表紙を並べる都合で表紙が見えないため、README の
 * 「概要のツールチップ」と表紙表示をここで兼ねる。
 *
 * 配置は画面幅で変える。狭い画面では画面下部のシートにする。
 * 本の近くに出すと本棚が隠れ、スライドで隣へ移る操作の邪魔になるため。
 */
export function BookPreview({
  book,
  onClose,
}: {
  book: Book;
  onClose: () => void;
}) {
  const releaseText =
    book.release_date_text ?? book.latest_release_date ?? '不明';

  return (
    <aside
      role="dialog"
      aria-label={`${book.title} の概要`}
      className="fixed inset-x-0 bottom-0 z-20 max-h-[70vh] overflow-y-auto rounded-t-lg bg-wood-50 p-4 shadow-book md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-0 md:max-h-none md:w-80 md:rounded-lg"
    >
      <div className="flex gap-3">
        {book.cover_image_url !== null && book.cover_image_url.length > 0 && (
          <Image
            src={book.cover_image_url}
            alt=""
            width={96}
            height={134}
            unoptimized
            className="h-32 w-24 flex-none object-contain"
          />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-bold text-wood-900">{book.title}</p>
          <p className="text-sm text-wood-700">{book.author}</p>
          <p className="text-sm text-wood-700">{book.publisher}</p>
          <p className="text-sm text-wood-700">発売日 {releaseText}</p>
          <p className="text-xs text-wood-600">
            {BOOK_CATEGORY_LABELS[book.category]}
            {book.is_ongoing ? '／連載中' : ''}
            {book.is_purchased ? '／購入済み' : '／未購入'}
          </p>
        </div>
      </div>

      {book.description !== null && book.description.length > 0 && (
        <p className="mt-3 line-clamp-6 text-sm text-wood-800">
          {book.description}
        </p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <Link
          href={`/books/${book.id}`}
          className="rounded bg-wood-600 px-3 py-1 text-sm font-medium text-wood-50 hover:bg-wood-700"
        >
          詳細を見る
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-wood-700 underline"
        >
          閉じる
        </button>
      </div>
    </aside>
  );
}
