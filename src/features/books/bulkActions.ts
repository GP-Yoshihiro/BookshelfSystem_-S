'use server';

import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  ONGOING_CAPABLE_CATEGORIES,
  type BookCategory,
} from '@/types/database';
import { userBooksCacheTag } from './keys';

export interface SaveBooksState {
  errorMessage: string;
  successMessage: string;
}

/** 画面から受け取る1巻ぶんの情報 */
interface IncomingBook {
  isbn: string;
  title: string;
  titleKana: string;
  author: string;
  publisher: string;
  coverImageUrl: string;
  description: string;
  releaseDate: string;
  releaseDateText: string;
  itemUrl: string;
}

const GENERIC_ERROR = '処理に失敗しました。時間をおいて再度お試しください。';
const NOTHING_SELECTED = '追加する巻を選んでください。';

/** 一度に保存できる上限。取り違えや誤操作で大量に入ることを防ぐ */
const MAX_BOOKS_PER_REQUEST = 60;

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 画面から届いた JSON を検証して取り込む。
 *
 * FormData は利用者が任意に差し替えられるため、型を信用してはならない。
 * 必須項目が欠けた要素は捨てる。
 */
function parseIncomingBooks(raw: string): IncomingBook[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 例外の内容は出力しない
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const result: IncomingBook[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const isbn = readString(record.isbn);
    const title = readString(record.title);
    if (isbn.length === 0 || title.length === 0) {
      continue;
    }
    result.push({
      isbn,
      title,
      titleKana: readString(record.titleKana),
      author: readString(record.author),
      publisher: readString(record.publisher),
      coverImageUrl: readString(record.coverImageUrl),
      description: readString(record.description),
      releaseDate: readString(record.releaseDate),
      releaseDateText: readString(record.releaseDateText),
      itemUrl: readString(record.itemUrl),
    });
    if (result.length >= MAX_BOOKS_PER_REQUEST) {
      break;
    }
  }

  return result;
}

function readCategory(formData: FormData): BookCategory {
  const value = formData.get('category');
  if (
    value === 'tankobon' ||
    value === 'series_tankobon' ||
    value === 'light_novel' ||
    value === 'comic'
  ) {
    return value;
  }
  return 'tankobon';
}

function readBoolean(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === 'true' || value === 'on';
}

function emptyToNull(value: string): string | null {
  return value.length === 0 ? null : value;
}

export async function saveBooksAction(
  _prevState: SaveBooksState,
  formData: FormData,
): Promise<SaveBooksState> {
  const supabase = await createClient();

  // user_id はフォームからではなく認証済みセッションから取得する
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    return { errorMessage: '認証が必要です。', successMessage: '' };
  }

  const rawBooks = formData.get('books');
  const books = parseIncomingBooks(
    typeof rawBooks === 'string' ? rawBooks : '',
  );

  if (books.length === 0) {
    return { errorMessage: NOTHING_SELECTED, successMessage: '' };
  }

  const category = readCategory(formData);
  // 単行本は DB の check 制約により連載中を持てない
  const isOngoing =
    ONGOING_CAPABLE_CATEGORIES.includes(category) &&
    readBoolean(formData, 'isOngoing');
  const isPurchased = readBoolean(formData, 'isPurchased');
  const purchasedAt = isPurchased ? new Date().toISOString() : null;

  const rows = books.map((book) => ({
    user_id: user.id,
    isbn: book.isbn,
    title: book.title,
    title_kana: emptyToNull(book.titleKana),
    author: book.author,
    publisher: book.publisher,
    category,
    is_ongoing: isOngoing,
    cover_image_url: emptyToNull(book.coverImageUrl),
    description: emptyToNull(book.description),
    is_purchased: isPurchased,
    purchased_at: purchasedAt,
    latest_release_date: emptyToNull(book.releaseDate),
    release_date_text: emptyToNull(book.releaseDateText),
    item_url: emptyToNull(book.itemUrl),
  }));

  // 既に本棚にある巻は一意制約に当たる。エラーにせず読み飛ばしたいので
  // ignoreDuplicates を使い、実際に入った件数を数える
  const { data, error } = await supabase
    .from('books')
    .upsert(rows, { onConflict: 'user_id,isbn', ignoreDuplicates: true })
    .select('id');

  if (error !== null) {
    // エラーオブジェクトは出力しない
    return { errorMessage: GENERIC_ERROR, successMessage: '' };
  }

  const addedCount = data?.length ?? 0;
  const skippedCount = rows.length - addedCount;

  revalidateTag(userBooksCacheTag(user.id));

  const skippedText =
    skippedCount > 0 ? `（${skippedCount}冊は追加済みのため省略）` : '';

  return {
    errorMessage: '',
    successMessage: `${addedCount}冊を本棚に追加しました。${skippedText}`,
  };
}
