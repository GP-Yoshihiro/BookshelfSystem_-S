'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

/**
 * 検索フォーム。
 * 入力のたびには検索せず、送信操作でのみ発火させる。
 * 楽天APIのレート制限（毎秒1リクエスト程度）へ配慮するため。
 *
 * 初期値は useSearchParams ではなく props で受け取る。useSearchParams は
 * Suspense 境界を要求することがあり、ページ側が既に値を持っているため
 * 渡すだけで済むから。
 */
export function SearchForm({ initialKeyword }: { initialKeyword: string }) {
  const router = useRouter();
  const [keyword, setKeyword] = useState(initialKeyword);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = keyword.trim();
    if (trimmed.length === 0) {
      return;
    }
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <label htmlFor="keyword" className="sr-only">
        検索キーワード
      </label>
      <input
        id="keyword"
        name="keyword"
        type="search"
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        placeholder="タイトル・著者名で検索"
        className="flex-1 rounded border border-wood-300 bg-wood-50 px-3 py-2 text-wood-900"
      />
      <button
        type="submit"
        className="rounded bg-wood-600 px-4 py-2 font-medium text-wood-50 hover:bg-wood-700"
      >
        検索
      </button>
    </form>
  );
}
