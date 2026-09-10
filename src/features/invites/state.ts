/**
 * 招待コード用フォームの初期状態。
 *
 * actions.ts には 'use server' が付与されており、そこからの全エクスポートは
 * Server Reference として扱われる。INVITE_INITIAL_STATE は関数ではない値の
 * エクスポートのため、actions.ts に置くとクライアント側で本来のオブジェクトを
 * 受け取れず（静的プリレンダリング時にクラッシュする）、この非 'use server'
 * ファイルに分離している（Task 6 の src/features/auth/state.ts と同様）。
 */

export interface InviteActionState {
  errorMessage: string;
  successMessage: string;
}

export const INVITE_INITIAL_STATE: InviteActionState = {
  errorMessage: '',
  successMessage: '',
};
