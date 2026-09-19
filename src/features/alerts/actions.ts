'use server';

import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { userAlertsCacheTag } from './keys';

export interface AlertActionState {
  errorMessage: string;
  successMessage: string;
}

const GENERIC_ERROR = '処理に失敗しました。時間をおいて再度お試しください。';
const AUTH_ERROR = '認証が必要です。';
const DELETE_FAILED_ERROR = '解除できませんでした。';

/** ISO 8601 の日付 (YYYY-MM-DD) だけを通す */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** FormData から文字列を取り出す。未入力・型違いは空文字とする */
function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/** 空文字を null へ寄せる。DB の nullable カラム用 */
function emptyToNull(value: string): string | null {
  return value.length === 0 ? null : value;
}

/** 巻数を整数へ。数値として読めなければ null（不明なだけで登録は妨げない） */
function readVolume(formData: FormData, key: string): number | null {
  const raw = readString(formData, key);
  if (raw.length === 0) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * 確定した発売日だけを date カラムへ入れる値へ変換する。
 *
 * 楽天APIの salesDate は「2026年秋」「2026年09月頃」のような確定できない
 * 表記も返す。これを勝手にその月の1日などへ解釈すると、実在しない予定を
 * カレンダーへ作ってしまう。確定日以外は null とし、原文は
 * latest_release_date_text へ残して表示にだけ使う（0006 の判断と同じ）。
 *
 * 形が合っていても 2026-02-31 のような実在しない日は採用しない。
 * Date へ通して同じ日付に戻るかで確かめる。
 */
function readReleaseDate(formData: FormData, key: string): string | null {
  const raw = readString(formData, key);
  if (!ISO_DATE_PATTERN.test(raw)) {
    return null;
  }
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10) === raw ? raw : null;
}

/**
 * 発売日アラートを登録する。既に登録済みの作品なら最新情報へ更新する。
 *
 * 重複を失敗として扱わないのは、利用者から見れば「通知中」のまま
 * 最新巻の情報が新しくなるだけで、やり直す必要がないため。
 */
export async function createAlertAction(
  _prevState: AlertActionState,
  formData: FormData,
): Promise<AlertActionState> {
  const supabase = await createClient();

  // user_id は必ず認証済みセッションから取得する。
  // フォームから渡された値を信用すると、他人名義のアラートを作れてしまう。
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    return { errorMessage: AUTH_ERROR, successMessage: '' };
  }

  const seriesKey = readString(formData, 'seriesKey');
  const seriesTitle = readString(formData, 'seriesTitle');
  const latestTitle = readString(formData, 'latestTitle');
  const latestIsbn = readString(formData, 'latestIsbn');

  if (
    seriesKey.length === 0 ||
    seriesTitle.length === 0 ||
    latestTitle.length === 0 ||
    latestIsbn.length === 0
  ) {
    return { errorMessage: GENERIC_ERROR, successMessage: '' };
  }

  const releaseDateText = readString(formData, 'releaseDateText');

  const { error } = await supabase.from('release_alerts').upsert(
    {
      user_id: user.id,
      series_key: seriesKey,
      series_title: seriesTitle,
      latest_volume: readVolume(formData, 'latestVolume'),
      latest_title: latestTitle,
      latest_isbn: latestIsbn,
      latest_release_date: readReleaseDate(formData, 'releaseDate'),
      // 確定できない表記も含め、原文はそのまま残して表示に使う
      latest_release_date_text: emptyToNull(releaseDateText),
      cover_image_url: emptyToNull(readString(formData, 'coverImageUrl')),
      // 更新側でも入れ直す。既存行の upsert では default now() が効かず、
      // 最終確認時刻が登録当時のまま古くなってしまうため
      checked_at: new Date().toISOString(),
    },
    // 一意制約 release_alerts_unique (user_id, series_key) と同じ列を指定する
    { onConflict: 'user_id,series_key' },
  );

  if (error !== null) {
    // エラーオブジェクトは出力しない
    return { errorMessage: GENERIC_ERROR, successMessage: '' };
  }

  revalidateTag(userAlertsCacheTag(user.id));
  return {
    errorMessage: '',
    successMessage: '発売日の通知を登録しました。',
  };
}

/**
 * 発売日アラートを解除する。
 *
 * 所有者の確認は RLS のポリシー release_alerts_delete_own に委ねる。
 * user_id = auth.uid() の行しか削除されないため、他人のアラート ID を
 * 送られても0件削除になる。アプリ側で所有者を確認する必要はない。
 */
export async function deleteAlertAction(
  _prevState: AlertActionState,
  formData: FormData,
): Promise<AlertActionState> {
  const alertId = readString(formData, 'alertId');

  if (alertId.length === 0) {
    return { errorMessage: GENERIC_ERROR, successMessage: '' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    return { errorMessage: AUTH_ERROR, successMessage: '' };
  }

  const { data, error } = await supabase
    .from('release_alerts')
    .delete()
    .eq('id', alertId)
    .select('id');

  if (error !== null) {
    // エラーオブジェクトは出力しない
    return { errorMessage: GENERIC_ERROR, successMessage: '' };
  }

  // 他人のアラートや存在しない ID は RLS により0件になる。
  // 「存在しない」と「他人のもの」を区別せず同じ文言にし、
  // ID の総当たりで他人の登録内容を推測できないようにする
  if (data === null || data.length === 0) {
    return { errorMessage: DELETE_FAILED_ERROR, successMessage: '' };
  }

  revalidateTag(userAlertsCacheTag(user.id));
  return { errorMessage: '', successMessage: '発売日の通知を解除しました。' };
}
