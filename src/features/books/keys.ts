/**
 * 本棚キャッシュのキーとタグを生成する純粋関数。
 *
 * 文字列を各所で直接組み立てると、userId をキーへ含め忘れても気づけない。
 * 含め忘れると利用者間でキャッシュが共有され、他人の本棚が見えてしまう。
 * そのため生成はここへ集約し、テストで固定する(設計書 8.1 の規則2)。
 */

export function userBooksCacheKey(userId: string): string[] {
  return ['user-books', userId];
}

export function userBooksCacheTag(userId: string): string {
  return `books:${userId}`;
}
