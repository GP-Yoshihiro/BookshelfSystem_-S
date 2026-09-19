'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { refreshStaleAlertsAction } from './refresh';

/**
 * カレンダーを開いたときに、古くなった発売日アラートの更新を一度だけ依頼する。
 *
 * ★更新を Server Component の描画中に行わない理由★
 * 描画は副作用を持つべきでなく、同じページを複数タブで開くと重複して走る。
 * そのため mount 後にクライアントから Server Action を呼び、実際に何か
 * 変わったときだけ router.refresh() で再描画する（設計書 9.2）。
 *
 * 画面には何も出さない。利用者の操作ではなく裏側の更新のため、
 * 完了の音声案内も出さない（CLAUDE.md 5章の「主要な処理」に当たらない）。
 */
export function StaleAlertRefresher() {
  const router = useRouter();
  // 開発時の StrictMode では effect が2回走る。二重に楽天へ問い合わせないよう
  // ref で実行済みを覚えておく（state だと再描画を挟み間に合わない）
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;

    const run = async (): Promise<void> => {
      try {
        const { updated } = await refreshStaleAlertsAction();
        if (updated > 0) {
          router.refresh();
        }
      } catch {
        // 更新できなくても表示中の内容はそのまま使える。
        // エラーオブジェクトは出力しない（CLAUDE.md 2章）
      }
    };

    void run();
  }, [router]);

  return null;
}
