import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { GenerateInviteButton } from '@/features/invites/GenerateInviteButton';
import { InviteCodeList } from '@/features/invites/InviteCodeList';

export const metadata: Metadata = { title: '招待コード | Bookshelf' };

// 発行・削除が即座に反映される必要があるためキャッシュしない
export const dynamic = 'force-dynamic';

export default async function InvitesPage() {
  const supabase = await createClient();

  // RLS invite_codes_select_own により、自分が発行したコードのみ取得される
  const { data, error } = await supabase
    .from('invite_codes')
    .select('*')
    .order('created_at', { ascending: false });

  const codes = error !== null || data === null ? [] : data;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-bold text-wood-50">招待コード</h1>

      <p className="text-sm text-wood-200">
        発行・表示・コピーの操作には、パスワードの再入力が必要です。一度確認すると
        5分間は再入力を求められません。離席時の覗き見を防ぐための確認であり、
        コードの秘匿そのものは保証しません。他人のコードは表示されません。
      </p>

      <GenerateInviteButton />

      {error !== null && (
        <p role="alert" className="text-sm text-red-300">
          招待コードの取得に失敗しました。時間をおいて再度お試しください。
        </p>
      )}

      <InviteCodeList codes={codes} />
    </div>
  );
}
