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
  const books = user === null ? [] : await getUserBooks(user.id);

  return <BookshelfView books={books} />;
}
