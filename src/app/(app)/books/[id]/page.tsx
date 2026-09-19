import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserBooks } from '@/features/books/cache';
import { DeleteBookButton } from '@/features/books/DeleteBookButton';
import { BOOK_CATEGORY_LABELS } from '@/types/database';

export const metadata: Metadata = { title: '書籍の詳細 | Bookshelf' };

export const dynamic = 'force-dynamic';

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    notFound();
  }

  // 1冊のために別クエリを投げず、キャッシュ済みの一覧から引く。
  // 他人の書籍はそもそも一覧に含まれないため、ここで弾かれる。
  const books = await getUserBooks(user.id);
  const book = books.find((item) => item.id === id);

  // 他人の書籍と存在しない書籍を区別しない。
  // 区別すると ID の総当たりで他人の蔵書の存在を推測できるため
  if (book === undefined) {
    notFound();
  }

  const releaseText =
    book.release_date_text ?? book.latest_release_date ?? '不明';

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/" className="text-sm text-wood-200 underline">
        ← 本棚へ戻る
      </Link>

      <div className="flex flex-col gap-4 rounded bg-wood-800 p-4 shadow-book sm:flex-row">
        {book.cover_image_url !== null && book.cover_image_url.length > 0 && (
          <Image
            src={book.cover_image_url}
            alt=""
            width={160}
            height={224}
            unoptimized
            className="h-56 w-40 flex-none self-start object-contain"
          />
        )}

        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="text-xl font-bold text-wood-50">{book.title}</h1>
          <dl className="space-y-1 text-sm text-wood-200">
            <div className="flex gap-2">
              <dt className="w-20 flex-none text-wood-300">著者</dt>
              <dd>{book.author}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 flex-none text-wood-300">出版社</dt>
              <dd>{book.publisher}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 flex-none text-wood-300">分類</dt>
              <dd>{BOOK_CATEGORY_LABELS[book.category]}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 flex-none text-wood-300">連載</dt>
              <dd>{book.is_ongoing ? '連載中' : '完結・単発'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 flex-none text-wood-300">購入</dt>
              <dd>{book.is_purchased ? '購入済み' : '未購入'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 flex-none text-wood-300">発売日</dt>
              <dd>{releaseText}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 flex-none text-wood-300">ISBN</dt>
              <dd>{book.isbn}</dd>
            </div>
          </dl>

          {book.item_url !== null && book.item_url.length > 0 && (
            <a
              href={book.item_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm text-wood-100 underline"
            >
              楽天ブックスで見る
            </a>
          )}

          <div className="pt-2">
            <DeleteBookButton
              bookId={book.id}
              title={book.title}
              redirectToShelf
            />
          </div>
        </div>
      </div>

      {book.description !== null && book.description.length > 0 && (
        <section className="rounded bg-wood-800 p-4">
          <h2 className="mb-2 text-sm font-bold text-wood-100">あらすじ</h2>
          <p className="whitespace-pre-wrap text-sm text-wood-200">
            {book.description}
          </p>
        </section>
      )}
    </div>
  );
}
