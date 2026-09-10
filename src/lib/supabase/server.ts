import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getPublicEnv, getServerEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Server Component / Server Action / Route Handler 用の Supabase クライアント。
 * ログイン中ユーザーのセッションを引き継ぎ、RLS が適用される。
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component からは Cookie を書き込めない。
          // セッション更新は middleware が担うため、ここでは無視して問題ない。
        }
      },
    },
  });
}

/**
 * RLS を迂回する管理者クライアント。
 * 招待コードの棚卸しなど、サーバーサイドの特権処理でのみ使用すること。
 * セッション情報は保持しない。
 */
export function createAdminClient() {
  const { supabaseUrl } = getPublicEnv();
  const { supabaseServiceRoleKey } = getServerEnv();

  return createServerClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // 管理者クライアントはセッションを永続化しない
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
