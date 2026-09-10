'use client';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getPublicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * 再認証のためにパスワードのみを検証する。
 *
 * persistSession:false の使い捨てクライアントを用いるため、検証の成否に
 * かかわらず現在のログインセッションには一切影響しない。取得したトークンは
 * 永続化されず、関数を抜けた時点で破棄される。
 *
 * パスワードはこの関数の外へ渡さず、呼び出し側は実行後に速やかに破棄すること。
 *
 * @returns パスワードが正しければ true。誤りや通信失敗なら false
 */
export async function verifyPassword(
  email: string,
  password: string,
): Promise<boolean> {
  if (email.length === 0 || password.length === 0) {
    return false;
  }

  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();

  const client = createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  try {
    const { error } = await client.auth.signInWithPassword({ email, password });
    return error === null;
  } catch {
    // 通信失敗も「検証できなかった」として扱う。
    // エラーオブジェクトには入力値が含まれ得るため出力しない（CLAUDE.md 2章）。
    return false;
  }
}
