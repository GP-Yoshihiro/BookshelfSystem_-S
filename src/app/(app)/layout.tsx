import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { signOutAction } from '@/features/auth/actions';
import { ReauthProvider } from '@/features/auth/ReauthProvider';
import { ReauthDialog } from '@/features/auth/ReauthDialog';
import { getCurrentUserRole } from '@/features/auth/profile';

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // middleware でも保護しているが、レイアウト側でも確認して二重に守る
  if (user === null) {
    redirect('/login');
  }

  // 招待コードの発行は管理者のみ。一般ユーザーには導線自体を出さない。
  // ただしこれは導線の話であり、権限そのものは DB 側で担保している。
  const role = await getCurrentUserRole();

  return (
    <ReauthProvider email={user.email ?? ''}>
      <ReauthDialog />
      <div className="min-h-screen bg-wood-900 bg-wood-grain">
        <header className="flex items-center justify-between bg-wood-800 px-4 py-3 shadow-shelf">
          <Link href="/" className="text-lg font-bold text-wood-50">
            Bookshelf
          </Link>
          <nav className="flex items-center gap-4 text-sm text-wood-100">
            {role === 'admin' && (
              <Link href="/settings/invites" className="hover:underline">
                招待コード
              </Link>
            )}
            <form action={signOutAction}>
              <button type="submit" className="hover:underline">
                ログアウト
              </button>
            </form>
          </nav>
        </header>
        <main className="p-4">{children}</main>
      </div>
    </ReauthProvider>
  );
}
