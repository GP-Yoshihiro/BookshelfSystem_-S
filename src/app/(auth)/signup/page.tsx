import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { SignupForm } from '@/features/auth/SignupForm';

export const metadata: Metadata = { title: '新規登録 | Bookshelf' };

// 既存ユーザーの有無は登録のたびに変わるため、キャッシュしない
export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('has_any_user');

  // 判定に失敗した場合は安全側に倒し、招待コードを必須として扱う
  const requiresInviteCode = error !== null || data !== false;

  return <SignupForm requiresInviteCode={requiresInviteCode} />;
}
