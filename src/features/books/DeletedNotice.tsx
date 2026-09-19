'use client';

import { useEffect, useRef, useState } from 'react';
import { speakComplete } from '@/lib/speech';
import { DELETED_PARAM, SHELF_PATH } from './routes';

/**
 * 詳細ページから削除して本棚へ戻ってきたことを知らせる。
 *
 * 削除の Server Action はサーバ側で本棚へ遷移するため、削除ボタンの
 * コンポーネントは結果を受け取る前に消えてしまう。処理完了の音声案内と
 * 表示はこちらで受け持つ。
 *
 * 検索条件は window.location から読む。useSearchParams を使うと
 * Suspense 境界が要るため、効果の中で一度だけ読む形にしている。
 */
export function DeletedNotice() {
  const [isVisible, setIsVisible] = useState(false);
  const hasRunRef = useRef(false);

  useEffect(() => {
    // 開発時の二重実行で音声が重ならないようにする
    if (hasRunRef.current) {
      return;
    }
    hasRunRef.current = true;

    const params = new URLSearchParams(window.location.search);
    if (params.get(DELETED_PARAM) !== '1') {
      return;
    }

    setIsVisible(true);
    speakComplete('本棚から削除しました。');

    // 再読み込みや共有で同じ案内が何度も出ないよう、クエリを消す
    window.history.replaceState(null, '', SHELF_PATH);
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <p
      role="status"
      className="mx-auto mb-4 max-w-5xl rounded bg-wood-800 px-3 py-2 text-sm text-wood-100"
    >
      本棚から削除しました。
    </p>
  );
}
