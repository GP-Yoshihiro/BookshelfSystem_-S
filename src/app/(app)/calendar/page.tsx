import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getUserAlerts } from '@/features/alerts/cache';
import { CalendarView } from '@/features/alerts/CalendarView';
import { StaleAlertRefresher } from '@/features/alerts/StaleAlertRefresher';

export const metadata: Metadata = { title: '発売日カレンダー | Bookshelf' };

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // userId は必ず認証済みセッションから取得する。
  // getUserAlerts は RLS を迂回する管理者クライアントを使うため（設計書 8.1 規則1）
  const alerts = user === null ? [] : await getUserAlerts(user.id);

  return (
    <>
      {/* 古いアラートの更新は描画の副作用にせず、mount 後にクライアントから
          依頼する。描画中に更新すると複数タブで重複して走る（設計書 9.2） */}
      <StaleAlertRefresher />
      <CalendarView alerts={alerts} />
    </>
  );
}
