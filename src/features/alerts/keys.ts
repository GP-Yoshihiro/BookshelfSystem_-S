/**
 * 発売日アラートのキャッシュのキーとタグを生成する純粋関数。
 *
 * 文字列を各所で直接組み立てると、userId をキーへ含め忘れても気づけない。
 * 含め忘れると利用者間でキャッシュが共有され、他人のアラートが見えてしまう。
 * そのため生成はここへ集約し、テストで固定する(設計書 8.1 の規則2)。
 */

export function userAlertsCacheKey(userId: string): string[] {
  return ['user-alerts', userId];
}

export function userAlertsCacheTag(userId: string): string {
  return `alerts:${userId}`;
}
