/**
 * 楽天ブックスAPIのレスポンスを本システムの形へ解釈する純粋関数群。
 * 通信を含まないため、テストで挙動を固定できる。
 */

import {
  ONGOING_CAPABLE_CATEGORIES,
  type BookCategory,
} from '@/types/database';

/**
 * ライトノベルと判定する booksGenreId の接頭辞。
 *
 * ⚠️ 実APIのレスポンスで未検証の暫定値。RAKUTEN_APP_ID を設定したあと
 * 実際のジャンルIDを確認して確定させること。判定を外しても保存画面で
 * 手動修正できるため、機能全体は成立する。
 * 値をここへ集約しているのは、確定時に1箇所だけ直せばよくするため。
 */
export const LIGHT_NOVEL_GENRE_PREFIXES: readonly string[] = ['001017'];

export interface ParsedSalesDate {
  /** YYYY-MM-DD。確定日を特定できたときのみ値が入る */
  date: string | null;
  /** 受け取った原文（前後の空白のみ除去） */
  text: string;
}

/** 実在する日付かを確認する。2026年02月30日 のような値を弾く */
function isRealDate(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * salesDate を解析する。
 *
 * 「2026年秋」「2026年09月頃」のような確定できない表記を、その月の1日などと
 * 解釈してはならない。カレンダーに実在しない予定を作ってしまうため。
 * 確定日でなければ date は null とし、表示には text を使う。
 */
export function parseSalesDate(salesDate: string): ParsedSalesDate {
  const text = salesDate.trim();
  if (text.length === 0) {
    return { date: null, text: '' };
  }

  const matched = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(text);
  if (matched === null) {
    return { date: null, text };
  }

  const [, rawYear, rawMonth, rawDay] = matched;
  if (
    rawYear === undefined ||
    rawMonth === undefined ||
    rawDay === undefined
  ) {
    return { date: null, text };
  }

  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);

  if (!isRealDate(year, month, day)) {
    return { date: null, text };
  }

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return { date: `${year}-${mm}-${dd}`, text };
}

/**
 * 4分類を推定する。上から順に評価し、最初に一致したものを採用する。
 * 楽天APIはこの4分類をそのまま返さないため推定が必要。
 */
export function estimateCategory(input: {
  size: string;
  booksGenreId: string;
  seriesName: string;
}): BookCategory {
  if (input.size.includes('コミック')) {
    return 'comic';
  }
  if (
    LIGHT_NOVEL_GENRE_PREFIXES.some((prefix) =>
      input.booksGenreId.startsWith(prefix),
    )
  ) {
    return 'light_novel';
  }
  if (input.seriesName.trim().length > 0) {
    return 'series_tankobon';
  }
  return 'tankobon';
}

/**
 * 連載中フラグの既定値。
 * 単行本は DB の check 制約により true を持てないため常に false を返す。
 */
export function isOngoingByDefault(
  seriesName: string,
  category: BookCategory,
): boolean {
  if (!ONGOING_CAPABLE_CATEGORIES.includes(category)) {
    return false;
  }
  return seriesName.trim().length > 0;
}
