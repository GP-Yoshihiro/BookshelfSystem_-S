'use server';

import { getCachedRakutenSearch } from './cache';
import { shouldSuggest, toSuggestions, SUGGEST_LIMIT } from './suggest';

/**
 * 検索欄の入力に対する候補を返す。
 *
 * 取得には本検索と同じ getCachedRakutenSearch を使う。候補を出した時点で
 * 結果が1時間キャッシュされるため、続けて検索を実行しても楽天へは
 * 再送されない。候補表示のために呼び出し回数が倍増することを防いでいる。
 *
 * 失敗しても候補を出さないだけで、利用者の入力は妨げない。候補は補助機能
 * であり、エラーを出して検索の手を止めさせる価値がないため。
 */
export async function suggestBooksAction(keyword: string): Promise<string[]> {
  if (!shouldSuggest(keyword)) {
    return [];
  }

  const result = await getCachedRakutenSearch(keyword, 1);
  if (!result.ok) {
    return [];
  }

  return toSuggestions(result.items, SUGGEST_LIMIT);
}
