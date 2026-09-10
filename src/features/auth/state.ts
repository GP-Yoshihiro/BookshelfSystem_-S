import type { AuthFormState } from './actions';

/**
 * 認証フォームの初期状態。
 *
 * actions.ts には 'use server' が付与されており、そこからの全エクスポートは
 * Server Reference として扱われる。AUTH_INITIAL_STATE は関数ではない値の
 * エクスポートのため、actions.ts に置くとクライアント側で本来のオブジェクトを
 * 受け取れず（静的プリレンダリング時にクラッシュする）、この非 'use server'
 * ファイルに分離している。
 */
export const AUTH_INITIAL_STATE: AuthFormState = { errorMessage: '' };
