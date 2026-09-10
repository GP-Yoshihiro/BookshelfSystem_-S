import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getPublicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * `from` に設定された Cookie をすべて `to` へコピーして返す。
 *
 * なぜ必要か: `getUser()` の呼び出し中にアクセストークンのリフレッシュが起きると、
 * `setAll` コールバックはリフレッシュ後の Cookie を新しい `NextResponse` (`response`)
 * へ書き込む。しかしリダイレクト時は `NextResponse.redirect(url)` で別のレスポンス
 * オブジェクトを新規生成するため、何もしなければこの Cookie が引き継がれない。
 * その結果、古いトークンだけがブラウザに残り、リフレッシュトークンのローテーション
 * によって無効化され、ユーザーが突然ログアウトさせられてしまう。これを防ぐため、
 * リダイレクト用レスポンスを生成するたびに本関数で Cookie を明示的に引き継ぐ。
 */
export function copySessionCookies(
  from: NextResponse,
  to: NextResponse,
): NextResponse {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
  return to;
}

/**
 * リクエストごとに Supabase のセッションを更新し、Cookie をレスポンスへ反映する。
 * middleware.ts から呼び出す。
 */
export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() を呼ぶことでトークンの検証とリフレッシュが行われる。
  // getSession() は Cookie の内容を検証せずに返すため保護の判断には使わない。
  // 取得したユーザー情報はここではログ出力しない。
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname === '/login' || pathname === '/signup';

  if (user === null && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    // リフレッシュ後の Cookie を引き継がないとサイレントなログアウトを招くため、
    // 新規生成する redirect レスポンスへ明示的にコピーする。
    return copySessionCookies(response, NextResponse.redirect(url));
  }

  if (user !== null && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    // 同上: リフレッシュ後の Cookie を引き継ぐ。
    return copySessionCookies(response, NextResponse.redirect(url));
  }

  return response;
}
