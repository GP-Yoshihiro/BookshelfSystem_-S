import type { SaveBooksState } from './bulkActions';

/**
 * 複数巻の一括保存フォームの初期状態。
 *
 * 'use server' ファイル（bulkActions.ts）は関数以外を export できないため、
 * 定数はこの非 'use server' ファイルへ分離している。
 */
export const SAVE_BOOKS_INITIAL_STATE: SaveBooksState = {
  errorMessage: '',
  successMessage: '',
};
