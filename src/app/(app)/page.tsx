import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getUserBooks } from '@/features/books/cache';
import { BookshelfView } from '@/features/bookshelf/BookshelfView';

export const metadata: Metadata = { title: '本棚 | Bookshelf' };

export const dynamic = 'force-dynamic';

export default async function BookshelfPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // userId は必ず認証済みセッションから取得する。
  // getUserBooks は RLS を迂回する管理者クライアントを使うため
  // （工程Dの設計書 8.1 規則1）
  // 本棚には購入済みの本だけを並べる。未購入の本は本棚に出さない方針のため、
  // 検索画面からも未購入での保存はできないようにしている
  const allBooks = user === null ? [] : await getUserBooks(user.id);
  const books = allBooks.filter((book) => book.is_purchased);

  return <BookshelfView books={books} />;
}
