'use server';

import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  ONGOING_CAPABLE_CATEGORIES,
  type BookCategory,
} from '@/types/database';
import { userBooksCacheTag } from './keys';

export interface SaveBookState {
  errorMessage: string;
  successMessage: string;
}

const GENERIC_ERROR = '処理に失敗しました。時間をおいて再度お試しください。';
const DUPLICATE_ERROR = 'この本は既に本棚にあります。';

/** FormData から文字列を取り出す。未入力・型違いは空文字とする */
function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/** チェックボックスの値を真偽へ変換する */
function readBoolean(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on' || formData.get(key) === 'true';
}

/** 想定外の値を弾き、既定の分類へ倒す */
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

/** 空文字を null へ寄せる。DB の nullable カラム用 */
function emptyToNull(value: string): string | null {
  return value.length === 0 ? null : value;
}

export async function saveBookAction(
  _prevState: SaveBookState,
  formData: FormData,
): Promise<SaveBookState> {
  const supabase = await createClient();

  // userId は必ず認証済みセッションから取得する。
  // フォームから渡された値を信用してはならない。
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    return { errorMessage: '認証が必要です。', successMessage: '' };
  }

  const isbn = readString(formData, 'isbn');
  const title = readString(formData, 'title');
  if (isbn.length === 0 || title.length === 0) {
    return { errorMessage: GENERIC_ERROR, successMessage: '' };
  }

  const category = readCategory(formData);
  // 単行本は DB の check 制約により連載中を持てない
  const isOngoing =
    ONGOING_CAPABLE_CATEGORIES.includes(category) &&
    readBoolean(formData, 'isOngoing');
  const isPurchased = readBoolean(formData, 'isPurchased');

  const { error } = await supabase.from('books').insert({
    user_id: user.id,
    isbn,
    title,
    title_kana: emptyToNull(readString(formData, 'titleKana')),
    author: readString(formData, 'author'),
    publisher: readString(formData, 'publisher'),
    category,
    is_ongoing: isOngoing,
    cover_image_url: emptyToNull(readString(formData, 'coverImageUrl')),
    description: emptyToNull(readString(formData, 'description')),
    is_purchased: isPurchased,
    // 購入済みのときのみ日時を入れる（DB の check 制約に合わせる）
    purchased_at: isPurchased ? new Date().toISOString() : null,
    latest_release_date: emptyToNull(readString(formData, 'releaseDate')),
    release_date_text: emptyToNull(readString(formData, 'releaseDateText')),
    item_url: emptyToNull(readString(formData, 'itemUrl')),
  });

  if (error !== null) {
    // エラーオブジェクトは出力しない。23505 は一意制約違反
    if (error.code === '23505') {
      return { errorMessage: DUPLICATE_ERROR, successMessage: '' };
    }
    return { errorMessage: GENERIC_ERROR, successMessage: '' };
  }

  revalidateTag(userBooksCacheTag(user.id));
  return {
    errorMessage: '',
    successMessage: isPurchased
      ? '購入済みとして本棚に追加しました。'
      : '本棚に追加しました。',
  };
}
