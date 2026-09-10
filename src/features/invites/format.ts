/**
 * 招待コードの有効期限に関する表示整形（純粋関数）。
 * now を引数で受け取り、テスト可能に保つ。
 */

export type InviteExpiryOption = 'none' | '1' | '7' | '30';

export const EXPIRY_OPTIONS: ReadonlyArray<{
  value: InviteExpiryOption;
  label: string;
}> = [
  { value: 'none', label: '無期限' },
  { value: '1', label: '1日' },
  { value: '7', label: '7日' },
  { value: '30', label: '30日' },
];

export const DEFAULT_EXPIRY_OPTION: InviteExpiryOption = '7';

/** generate_invite_code へ渡す日数。無期限は null */
export function toExpiresInDays(option: InviteExpiryOption): number | null {
  return option === 'none' ? null : Number(option);
}

/** 期限切れか。解釈できない値は安全側に倒して期限切れとして扱う */
export function isExpired(expiresAt: string | null, now: Date): boolean {
  if (expiresAt === null) {
    return false;
  }
  const time = new Date(expiresAt).getTime();
  if (Number.isNaN(time)) {
    return true;
  }
  return time < now.getTime();
}

/** 一覧に表示する有効期限の文字列 */
export function formatExpiry(expiresAt: string | null, now: Date): string {
  if (expiresAt === null) {
    return '無期限';
  }
  if (isExpired(expiresAt, now)) {
    return '期限切れ';
  }
  const date = new Date(expiresAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day} まで`;
}
