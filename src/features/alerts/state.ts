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

/**
 * 楽天へ再度問い合わせるまでの間隔（24時間）。
 *
 * checked_at がこれより古いアラートを「古い」と見なして更新対象にする。
 * refresh.ts は 'use server' のため定数を export できず、ここへ置いている。
 */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * 1回の実行で更新する作品数の上限。
 *
 * カレンダーを開くたびに全作品を問い合わせると楽天への呼び出しが一気に増え、
 * QPS 制限に触れる。上限を超えた分は次にカレンダーを開いたときに処理される。
 * checked_at の古い順に処理するため、同じ作品だけが取り残されることはない。
 */
export const MAX_REFRESH_PER_RUN = 5;
