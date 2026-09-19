'use server';

import { revalidateTag } from 'next/cache';
import { getCachedRakutenSearch } from '@/features/rakuten/cache';
import { groupBySeries, splitExcluded } from '@/features/rakuten/grouping';
import { parseSalesDate } from '@/features/rakuten/parse';
import { createClient } from '@/lib/supabase/server';
import type { ReleaseAlert, ReleaseAlertUpdate } from '@/types/database';
import { userAlertsCacheTag } from './keys';
import { MAX_REFRESH_PER_RUN, STALE_AFTER_MS } from './state';

/** 認証済みセッションを引き継ぐ Supabase クライアント（RLS が適用される） */
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export interface RefreshAlertsResult {
  /** 最新巻の情報が実際に書き換わった作品数 */
  updated: number;
}

const NOTHING_UPDATED: RefreshAlertsResult = { updated: 0 };

/** 1作品の更新結果。checked_at だけ書いた場合と区別する */
type AlertRefreshOutcome = 'updated' | 'unchanged' | 'skipped';

/**
 * checked_at だけを現在時刻へ進める。
 *
 * 新しい巻が無かった作品でも必ず呼ぶ。これを省くと checked_at が古いままとなり、
 * カレンダーを開くたびに同じ作品へ問い合わせ続けることになる。
 */
async function touchCheckedAt(
  supabase: SupabaseClient,
  alertId: string,
): Promise<AlertRefreshOutcome> {
  const { error } = await supabase
    .from('release_alerts')
    .update({ checked_at: new Date().toISOString() })
    .eq('id', alertId);

  // エラーオブジェクトは出力しない。次回また対象になるだけで実害はない
  return error === null ? 'unchanged' : 'skipped';
}

/**
 * 1作品を楽天へ問い合わせ、新しい巻が出ていれば最新巻の情報を書き換える。
 *
 * ★「新しい巻か」は巻数で判定する★
 * 発売日で比べると、特装版・復刻版・電子版の配信日が最新巻より後になることが
 * あり、古い巻を最新と誤判定する。groupBySeries が latest を巻数の最大で
 * 決めているのと同じ理由で、ここでも巻数だけを見る。
 */
async function refreshOneAlert(
  supabase: SupabaseClient,
  alert: ReleaseAlert,
): Promise<AlertRefreshOutcome> {
  const result = await getCachedRakutenSearch(alert.series_title, 1);

  // 楽天が未設定・一時的な失敗のときは checked_at を進めない。
  // 「確認した結果、新刊が無かった」のではなく確認できていないため、
  // 次の機会に改めて問い合わせる（1回あたりの件数は上限で守られている）
  if (!result.ok) {
    return 'skipped';
  }

  const { kept } = splitExcluded(result.items);
  const groups = groupBySeries(kept);
  // 突き合わせは series_key で行う。表示名は表記ゆれがあり突き合わせに使えない
  const group = groups.find((candidate) => candidate.key === alert.series_key);

  if (group === undefined || group.latest === null) {
    // 検索結果から同じ作品を見つけられなくても、確認はできている。
    // 無限に問い合わせ続けないよう checked_at は進める
    return touchCheckedAt(supabase, alert.id);
  }

  const latest = group.latest;
  const foundVolume = latest.volume;
  const isNewerVolume =
    foundVolume !== null &&
    (alert.latest_volume === null || foundVolume > alert.latest_volume);

  if (!isNewerVolume) {
    return touchCheckedAt(supabase, alert.id);
  }

  // 確定した発売日だけを date へ入れ、「2026年秋」のような原文は text へ残す。
  // 確定できない表記をその月の1日などと解釈すると、実在しない予定を
  // カレンダーへ作ってしまう（actions.ts と同じ扱い）
  const sales = parseSalesDate(latest.item.salesDate);
  const coverImageUrl = latest.item.largeImageUrl.trim();

  const patch: ReleaseAlertUpdate = {
    latest_volume: foundVolume,
    latest_title: latest.item.title,
    latest_isbn: latest.item.isbn,
    latest_release_date: sales.date,
    latest_release_date_text: sales.text.length === 0 ? null : sales.text,
    cover_image_url: coverImageUrl.length === 0 ? null : coverImageUrl,
    checked_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('release_alerts')
    .update(patch)
    .eq('id', alert.id)
    .select('id');

  if (error !== null || data === null || data.length === 0) {
    // エラーオブジェクトは出力しない。1件の失敗で全体を止めず、次の作品へ進む
    return 'skipped';
  }

  return 'updated';
}

/**
 * 最終確認から24時間以上たった発売日アラートを、楽天の検索結果で更新する。
 *
 * ★Server Component の描画中に呼んではならない★
 * 描画は副作用を持つべきでなく、同じページを複数タブで開くと重複して走る。
 * クライアントの StaleAlertRefresher が mount 時に一度だけ呼ぶ（設計書 9.2）。
 *
 * 1回の実行で扱うのは MAX_REFRESH_PER_RUN 件まで。残りは次回に回す。
 * 1件の失敗は握りつぶして他の作品の更新を続ける。
 */
export async function refreshStaleAlertsAction(): Promise<RefreshAlertsResult> {
  const supabase = await createClient();

  // user_id は必ず認証済みセッションから取得する
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    return NOTHING_UPDATED;
  }

  const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString();

  // ★絞り込みは DB のクエリで行う★
  // 取得してからコードで切り詰めると、楽天への問い合わせ回数は減らせても
  // 不要な行を読むことになる。checked_at の古い順に上限件数だけ取ることで、
  // 楽天への呼び出しも DB の読み取りも同時に上限内へ収まる。
  // 所有者の絞り込みは RLS の release_alerts_select_own に委ねる
  const { data, error } = await supabase
    .from('release_alerts')
    .select('*')
    .lt('checked_at', staleBefore)
    .order('checked_at', { ascending: true })
    .limit(MAX_REFRESH_PER_RUN);

  if (error !== null || data === null) {
    // エラーオブジェクトは出力しない
    return NOTHING_UPDATED;
  }

  let updated = 0;

  for (const alert of data) {
    // 1件の失敗で全体を止めない。想定外の例外も含めてここで受け止める
    try {
      if ((await refreshOneAlert(supabase, alert)) === 'updated') {
        updated += 1;
      }
    } catch {
      // エラーオブジェクトは出力しない
    }
  }

  if (updated > 0) {
    // 表示に使う値が変わったときだけ無効化する。
    // checked_at は画面に出ないため、それだけの更新では再取得させない
    revalidateTag(userAlertsCacheTag(user.id));
  }

  return { updated };
}
