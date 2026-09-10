import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getCachedRakutenSearch } from '@/features/rakuten/cache';
import { getUserBooks } from '@/features/books/cache';
import { SearchForm } from '@/features/rakuten/SearchForm';
import { SearchResults } from '@/features/rakuten/SearchResults';

export const metadata: Metadata = { title: '本を探す | Bookshelf' };

export const dynamic = 'force-dynamic';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const keyword = typeof q === 'string' ? q : '';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // userId は必ず認証済みセッションから取得する（設計書 8.1 の規則1）。
  // レイアウトで未認証は弾かれているが、型のために念のため確認する。
  const ownedIsbns = new Set<string>(
    user === null ? [] : (await getUserBooks(user.id)).map((book) => book.isbn),
  );

  const result = await getCachedRakutenSearch(keyword, 1);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-bold text-wood-50">本を探す</h1>

      <SearchForm initialKeyword={keyword} />

      {!result.ok && result.reason === 'not_configured' && (
        <p role="alert" className="rounded bg-wood-800 p-3 text-sm text-wood-100">
          楽天ウェブサービスのアプリIDが未設定です。`.env.local` に
          `RAKUTEN_APP_ID` を設定してください。
        </p>
      )}

      {!result.ok && result.reason === 'request_failed' && (
        <p role="alert" className="text-sm text-red-300">
          書籍の検索に失敗しました。時間をおいて再度お試しください。
        </p>
      )}

      {result.ok && keyword.length > 0 && (
        <>
          <p className="text-sm text-wood-300">
            「{keyword}」の検索結果 {result.count} 件
          </p>
          <SearchResults items={result.items} ownedIsbns={ownedIsbns} />
        </>
      )}
    </div>
  );
}
