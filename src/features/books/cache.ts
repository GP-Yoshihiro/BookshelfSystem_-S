import 'server-only';

import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import type { Book } from '@/types/database';
import { userBooksCacheKey, userBooksCacheTag } from './keys';

/**
 * 利用者の本棚を取得する。結果はキャッシュされ、保存・更新・削除の
 * Server Action が revalidateTag(userBooksCacheTag(userId)) で無効化する。
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
export async function getUserBooks(userId: string): Promise<Book[]> {
  if (userId.length === 0) {
    return [];
  }

  const load = unstable_cache(
    async (): Promise<Book[]> => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('books')
        .select('*')
        // 管理者クライアントは RLS が効かないため、絞り込みを必ず書く
        // (設計書 8.1 の規則3)。これを落とすと全利用者の本が返る
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error !== null || data === null) {
        // エラーオブジェクトは出力しない
        return [];
      }
      return data;
    },
    userBooksCacheKey(userId),
    { tags: [userBooksCacheTag(userId)] },
  );

  return load();
}
