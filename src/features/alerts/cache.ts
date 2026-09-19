import 'server-only';

import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import type { ReleaseAlert } from '@/types/database';
import { userAlertsCacheKey, userAlertsCacheTag } from './keys';

/**
 * キャッシュを保持する秒数。
 *
 * アプリ内の追加・更新・削除は revalidateTag が即座に無効化するため、
 * 通常の操作でこの時間を待つことはない。これはアプリの外で DB が
 * 変わったときの保険である。タグしか指定しないと有効期限が無く、
 * 外から消した本がいつまでも残り続ける（実際に起きた）。
 */
const CACHE_REVALIDATE_SECONDS = 3600;

/**
 * 利用者の発売日アラートを取得する。結果はキャッシュされ、登録・解除の
 * Server Action が revalidateTag(userAlertsCacheTag(userId)) で無効化する。
 *
 * ★安全上きわめて重要★
 * unstable_cache の内部では cookies() を読めないため、セッションを引き継ぐ
 * 通常のクライアントを使えず、RLS を迂回する管理者クライアントを使っている。
 * つまり RLS の保護が外れており、userId の正しさだけが唯一の防壁である。
 *
 * 呼び出し側は、必ず supabase.auth.getUser() から得た userId を渡すこと。
 * リクエストパラメータや props から受け取った値を渡してはならない。
 * (設計書 8.1 の規則1)
 */
export async function getUserAlerts(userId: string): Promise<ReleaseAlert[]> {
  if (userId.length === 0) {
    return [];
  }

  const load = unstable_cache(
    async (): Promise<ReleaseAlert[]> => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('release_alerts')
        .select('*')
        // 管理者クライアントは RLS が効かないため、絞り込みを必ず書く
        // (設計書 8.1 の規則3)。これを落とすと全利用者のアラートが返る
        .eq('user_id', userId)
        // カレンダーは発売日順に読む。発売日が未確定のものは末尾へ回す
        .order('latest_release_date', { ascending: true, nullsFirst: false });

      if (error !== null || data === null) {
        // エラーオブジェクトは出力しない
        return [];
      }
      return data;
    },
    userAlertsCacheKey(userId),
    {
      tags: [userAlertsCacheTag(userId)],
      revalidate: CACHE_REVALIDATE_SECONDS,
    },
  );

  return load();
}
