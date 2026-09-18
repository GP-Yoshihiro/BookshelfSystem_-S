/**
 * 本棚のソート・絞り込み・検索を行う純粋関数。
 *
 * すべてブラウザ側で処理する。README が求めるリアルタイム検索を
 * 体感ゼロで実現でき、Supabase へのリクエストも増えないため。
 *
 * どの関数も入力の配列を書き換えない。React の state をそのまま
 * 渡すため、破壊すると再描画が壊れる。
 */

import type { Book, BookCategory } from '@/types/database';

export type SortKey = 'category' | 'publisher' | 'title';
export type SortOrder = 'asc' | 'desc';

/** 分類別ソートの並び順。薄い本から厚い本、という直感に合わせている */
export const CATEGORY_SORT_ORDER: readonly BookCategory[] = [
  'tankobon',
  'series_tankobon',
  'light_novel',
  'comic',
];

export interface BookFilters {
  categories: readonly BookCategory[];
  publishers: readonly string[];
  onlyOngoing: boolean;
}

/** 何も絞り込まない状態 */
export const EMPTY_FILTERS: BookFilters = {
  categories: [],
  publishers: [],
  onlyOngoing: false,
};

/** 日本語を含む文字列の比較 */
function compareJa(left: string, right: string): number {
  return left.localeCompare(right, 'ja');
}

/**
 * タイトル比較に使う文字列。
 *
 * 楽天が titleKana を返さない書籍があるため、無ければタイトル本体を使う。
 * カナが無いものを末尾へ固めると、探している本が見つからなくなる。
 * 並びは多少乱れるが、本が行方不明になるよりは良い。
 */
function titleSortKey(target: Book): string {
  const kana = target.title_kana?.trim() ?? '';
  return kana.length > 0 ? kana : target.title;
}

export function sortBooks(
  books: readonly Book[],
  key: SortKey,
  order: SortOrder,
): Book[] {
  const sorted = [...books].sort((left, right) => {
    if (key === 'category') {
      return (
        CATEGORY_SORT_ORDER.indexOf(left.category) -
        CATEGORY_SORT_ORDER.indexOf(right.category)
      );
    }
    if (key === 'publisher') {
      return compareJa(left.publisher, right.publisher);
    }
    return compareJa(titleSortKey(left), titleSortKey(right));
  });

  return order === 'desc' ? sorted.reverse() : sorted;
}

export function filterBooks(
  books: readonly Book[],
  filters: BookFilters,
): Book[] {
  return books.filter((target) => {
    if (
      filters.categories.length > 0 &&
      !filters.categories.includes(target.category)
    ) {
      return false;
    }
    if (
      filters.publishers.length > 0 &&
      !filters.publishers.includes(target.publisher)
    ) {
      return false;
    }
    if (filters.onlyOngoing && !target.is_ongoing) {
      return false;
    }
    return true;
  });
}

/**
 * タイトル・著者・出版社を対象に部分一致で絞り込む。
 *
 * README は「タイトル、著者、関連タグ」と書いているが、本システムに
 * tags の概念はない。分類と出版社がタグに相当するため、出版社を
 * 検索対象に含めることで要件を満たす（分類は絞り込み側で扱う）。
 */
export function searchBooks(books: readonly Book[], query: string): Book[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return [...books];
  }

  return books.filter((target) => {
    const haystack =
      `${target.title} ${target.author} ${target.publisher}`.toLowerCase();
    return haystack.includes(normalized);
  });
}
