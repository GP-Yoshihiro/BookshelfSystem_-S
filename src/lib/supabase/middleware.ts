import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getPublicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

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
    return NextResponse.redirect(url);
  }

  if (user !== null && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}
