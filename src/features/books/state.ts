import type { SaveBookState } from './actions';

/**
 * 本棚保存フォームの初期状態。
 *
 * 'use server' ファイル（actions.ts）は関数以外を export できないため、
 * 定数はこの非 'use server' ファイルへ分離している。
 */
export const SAVE_BOOK_INITIAL_STATE: SaveBookState = {
  errorMessage: '',
  successMessage: '',
};
