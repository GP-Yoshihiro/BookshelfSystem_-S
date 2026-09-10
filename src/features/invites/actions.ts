'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { toExpiresInDays, type InviteExpiryOption } from './format';
import type { InviteActionState } from './state';

// 'use server' ファイルの全エクスポートは Server Reference として扱われるため、
// 値のエクスポート（INVITE_INITIAL_STATE）はここに置けない。
// 型 (InviteActionState) はコンパイル時に消去されるため問題ないが、
// 値は ./state.ts に分離し、そちらから import すること。

const GENERIC_ERROR = '処理に失敗しました。時間をおいて再度お試しください。';

function readExpiryOption(formData: FormData): InviteExpiryOption {
  const value = formData.get('expiry');
  if (value === 'none' || value === '1' || value === '7' || value === '30') {
    return value;
  }
  return '7';
}

export async function generateInviteCodeAction(
  _prevState: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const supabase = await createClient();
  const expiresInDays = toExpiresInDays(readExpiryOption(formData));

  const { error } = await supabase.rpc('generate_invite_code', {
    p_expires_in_days: expiresInDays,
  });

  if (error) {
    // エラーオブジェクトは出力しない（CLAUDE.md 2章）
    return { errorMessage: GENERIC_ERROR, successMessage: '' };
  }

  revalidatePath('/settings/invites');
  return { errorMessage: '', successMessage: '招待コードを発行しました。' };
}

export async function deleteInviteCodeAction(
  _prevState: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const idValue = formData.get('id');
  const id = typeof idValue === 'string' ? idValue : '';

  if (id.length === 0) {
    return { errorMessage: GENERIC_ERROR, successMessage: '' };
  }

  const supabase = await createClient();
  // RLS invite_codes_delete_own により、未使用かつ自分が発行したコードのみ削除できる
  const { error } = await supabase.from('invite_codes').delete().eq('id', id);

  if (error) {
    return { errorMessage: GENERIC_ERROR, successMessage: '' };
  }

  revalidatePath('/settings/invites');
  return { errorMessage: '', successMessage: '招待コードを削除しました。' };
}
