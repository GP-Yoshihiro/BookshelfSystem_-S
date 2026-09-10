/**
 * 環境変数の読み出しを一箇所へ集約する。
 * 値そのものはログへ出力しない（CLAUDE.md 2章: 情報漏洩対策）。
 */

function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(
      `環境変数 ${name} が設定されていません。.env.local.example を参照して設定してください。`,
    );
  }
  return value;
}

/** ブラウザからも参照可能な公開設定 */
export function getPublicEnv(): {
  supabaseUrl: string;
  supabaseAnonKey: string;
} {
  return {
    supabaseUrl: requireEnv(
      'NEXT_PUBLIC_SUPABASE_URL',
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    supabaseAnonKey: requireEnv(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  };
}

/** サーバーサイド専用の設定。クライアントから import してはならない */
export function getServerEnv(): {
  supabaseServiceRoleKey: string;
  rakutenAppId: string;
  rakutenAffiliateId: string | undefined;
} {
  return {
    supabaseServiceRoleKey: requireEnv(
      'SUPABASE_SERVICE_ROLE_KEY',
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    rakutenAppId: requireEnv('RAKUTEN_APP_ID', process.env.RAKUTEN_APP_ID),
    rakutenAffiliateId: process.env.RAKUTEN_AFFILIATE_ID || undefined,
  };
}

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}
