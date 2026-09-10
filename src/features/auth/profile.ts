import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/database';

/**
 * ログイン中ユーザーのロールを返す。
 *
 * 取得に失敗した場合は安全側に倒して 'user' を返す。管理者向けの導線を
 * 誤って表示するより、表示しない方が害が小さいため。
 * なお表示の出し分けは導線の話に過ぎず、実際の権限は DB 側
 * （generate_invite_code の管理者チェックと RLS）で担保している。
 */
export async function getCurrentUserRole(): Promise<UserRole> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    return 'user';
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error !== null || data === null) {
    return 'user';
  }
  return data.role;
}
