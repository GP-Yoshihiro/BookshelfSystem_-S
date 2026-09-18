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

/**
 * RLS を迂回する管理者クライアント用のキー。
 * クライアントから import してはならない。
 *
 * 用途ごとに必要な変数だけを要求する。以前はサーバー用の変数をひとまとめに
 * 要求していたため、Supabase の管理者クライアントを作るだけで楽天の
 * アプリIDまで必須になり、キー未取得の状態でデプロイすると落ちていた。
 */
export function getSupabaseServiceRoleKey(): string {
  return requireEnv(
    'SUPABASE_SERVICE_ROLE_KEY',
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * 楽天ウェブサービスのアプリID。
 * 未設定でもアプリは動作する必要があるため、例外を投げず undefined を返す。
 * 設定の有無の判定には features/rakuten/client.ts の
 * isRakutenConfigured() を使うこと。
 */
export function getRakutenAppId(): string | undefined {
  return process.env.RAKUTEN_APP_ID || undefined;
}

/**
 * 楽天ウェブサービスのアクセスキー。
 * 2026年の仕様変更で applicationId と対で必須になった。
 * アプリIDと同様、未設定でもアプリは動作する必要があるため例外を投げない。
 */
export function getRakutenAccessKey(): string | undefined {
  return process.env.RAKUTEN_ACCESS_KEY || undefined;
}

/** 楽天アフィリエイトID。任意項目のため未設定を許容する */
export function getRakutenAffiliateId(): string | undefined {
  return process.env.RAKUTEN_AFFILIATE_ID || undefined;
}

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}
