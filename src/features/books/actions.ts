'use server';

import { revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  ONGOING_CAPABLE_CATEGORIES,
  type BookCategory,
} from '@/types/database';
import { userBooksCacheTag } from './keys';
import { DELETED_PARAM, SHELF_PATH } from './routes';

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

export interface DeleteBookState {
  errorMessage: string;
  /** 削除できた書籍の ID。呼び出し側が成功を判定するために使う */
  deletedId: string;
}

/**
 * 本棚から書籍を削除する。
 *
 * 所有者の確認は RLS のポリシー books_delete_own に委ねる。
 * user_id = auth.uid() の行しか削除されないため、他人の書籍 ID を
 * 送られても0件削除になる。アプリ側で所有者を確認する必要はない。
 */
export async function deleteBookAction(
  _prevState: DeleteBookState,
  formData: FormData,
): Promise<DeleteBookState> {
  const bookId = readString(formData, 'bookId');

  if (bookId.length === 0) {
    return { errorMessage: GENERIC_ERROR, deletedId: '' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    return { errorMessage: '認証が必要です。', deletedId: '' };
  }

  const { data, error } = await supabase
    .from('books')
    .delete()
    .eq('id', bookId)
    .select('id');

  if (error !== null) {
    // エラーオブジェクトは出力しない
    return { errorMessage: GENERIC_ERROR, deletedId: '' };
  }

  // 他人の書籍や存在しない ID は RLS により0件になる。
  // 「存在しない」と「他人のもの」を区別せず同じ文言にし、
  // ID の総当たりで他人の蔵書を推測できないようにする
  if (data === null || data.length === 0) {
    return { errorMessage: '削除できませんでした。', deletedId: '' };
  }

  revalidateTag(userBooksCacheTag(user.id));

  // 詳細ページから削除したときは、ここで本棚へ送る。
  //
  // クライアント側で router.push しようとすると間に合わない。
  // revalidateTag により現在の詳細ページが再描画され、消した本が
  // 見つからず notFound() に落ちて、遷移を指示する useEffect が動く前に
  // コンポーネントごと消えてしまうため（実機で 404 に着地するのを確認済み）。
  //
  // 行き先は固定文字列にする。クライアントから受け取った URL へ飛ばすと
  // オープンリダイレクトになるため、真偽値だけを受け取る。
  if (readBoolean(formData, 'redirectToShelf')) {
    redirect(`${SHELF_PATH}?${DELETED_PARAM}=1`);
  }

  return { errorMessage: '', deletedId: bookId };
}
