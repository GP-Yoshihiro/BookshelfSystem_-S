/**
 * 削除後の遷移で使う定数。
 *
 * actions.ts は 'use server' のため関数以外を export できない。
 * サーバ側（遷移元）とクライアント側（遷移先の案内）の両方から参照するので、
 * この非 'use server' ファイルへ置いている。
 */

/** 本棚のパス */
export const SHELF_PATH = '/';

/** 削除直後であることを本棚へ伝えるクエリ名 */
export const DELETED_PARAM = 'deleted';
