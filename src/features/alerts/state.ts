import type { AlertActionState } from './actions';

/**
 * 発売日アラートの操作フォームの初期状態。
 *
 * 'use server' ファイル（actions.ts）は関数以外を export できないため、
 * 定数はこの非 'use server' ファイルへ分離している。
 */
export const ALERT_ACTION_INITIAL_STATE: AlertActionState = {
  errorMessage: '',
  successMessage: '',
};
