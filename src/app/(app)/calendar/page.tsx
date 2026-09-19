import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getUserAlerts } from '@/features/alerts/cache';
import { CalendarView } from '@/features/alerts/CalendarView';

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

  return <CalendarView alerts={alerts} />;
}
