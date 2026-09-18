/**
 * 検索候補（サジェスト）を組み立てる純粋関数。
 * 通信を含まないため、挙動をテストで固定できる。
 */

import type { RakutenBookItem } from './types';

/**
 * 候補取得を始める最小文字数。
 *
 * 1文字目から叩くと、数文字打つ間に毎秒複数回リクエストすることになり、
 * 楽天のレート制限（毎秒1リクエスト程度）に抵触する恐れがある。
 */
export const SUGGEST_MIN_LENGTH = 2;

/** 一度に表示する候補の最大件数 */
export const SUGGEST_LIMIT = 8;

/** 入力停止から候補を取りに行くまでの待ち時間（ミリ秒） */
export const SUGGEST_DEBOUNCE_MS = 400;

/**
 * この入力で候補を取りに行くべきか。
 * 空白のみの入力では検索する意味がないため取りに行かない。
 */
export function shouldSuggest(keyword: string): boolean {
  return keyword.trim().length >= SUGGEST_MIN_LENGTH;
}

/**
 * 検索結果から候補の文字列一覧を作る。
 *
 * 楽天は同一タイトルの別版（特装版・電子版など）を複数返すため、
 * そのまま並べると同じ文字列が並んで候補として役に立たない。
 * 前後の空白を取り除いたうえで重複を除く。
 */
export function toSuggestions(
  items: readonly RakutenBookItem[],
  limit: number,
): string[] {
  if (limit <= 0) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const title = item.title.trim();
    if (title.length === 0 || seen.has(title)) {
      continue;
    }
    seen.add(title);
    result.push(title);
    if (result.length >= limit) {
      break;
    }
  }

  return result;
}
