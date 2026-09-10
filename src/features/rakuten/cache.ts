import 'server-only';

import { unstable_cache } from 'next/cache';
import { isRakutenConfigured, searchBooksOrThrow } from './client';
import type { RakutenSearchResult } from './types';

/** 検索結果を保持する秒数。楽天への呼び出しを抑える */
const SEARCH_REVALIDATE_SECONDS = 3600;

/**
 * 楽天ブックスの検索結果をキャッシュ付きで取得する。
 *
 * 失敗結果をキャッシュしないよう、キャッシュの内側では例外を投げる関数を
 * そのまま呼び、外側で捕捉して union へ変換している。unstable_cache は
 * 例外時にエントリを保存しないため、一時的な失敗が1時間焼き付くことを防げる。
 */
export async function getCachedRakutenSearch(
  keyword: string,
  page: number,
): Promise<RakutenSearchResult> {
  const trimmed = keyword.trim();
  if (trimmed.length === 0) {
    return { ok: true, items: [], count: 0, page, pageCount: 0 };
  }
  if (!isRakutenConfigured()) {
    return { ok: false, reason: 'not_configured' };
  }

  const load = unstable_cache(
    async () => searchBooksOrThrow({ keyword: trimmed, page }),
    ['rakuten-search', trimmed, String(page)],
    { revalidate: SEARCH_REVALIDATE_SECONDS, tags: ['rakuten-search'] },
  );

  try {
    const result = await load();
    return { ok: true, ...result };
  } catch {
    // エラーオブジェクトは出力しない。APP_ID を含みうるため
    return { ok: false, reason: 'request_failed' };
  }
}
