'use client';

import { useActionState, useEffect } from 'react';
import { parseSalesDate } from '@/features/rakuten/parse';
import type { SeriesGroup } from '@/features/rakuten/grouping';
import { speakComplete, speakError } from '@/lib/speech';
import { createAlertAction, deleteAlertAction } from './actions';
import { ALERT_ACTION_INITIAL_STATE } from './state';

/**
 * 検索結果の作品に発売日アラートを登録・解除するボタン。
 *
 * ★このボタンは本棚へ何も追加しない★
 * 発売日の通知と本棚は別物であり、通知したいだけの作品を勝手に
 * 所有扱いにしてはならない。そのため saveBooksAction は呼ばない。
 *
 * 送る値はすべて hidden input で固定する。submit ボタンの name/value に
 * 載せると、submitter を伴わない送信（Enter キーなど）で値が欠け、
 * 黙って不完全な登録になる（工程 C-1 で実際に直した壊れ方と同じ）。
 */
export function AlertButton({
  group,
  alertId,
}: {
  group: SeriesGroup;
  /** 登録済みならそのアラートID。未登録なら null */
  alertId: string | null;
}) {
  const [createState, createFormAction, isCreating] = useActionState(
    createAlertAction,
    ALERT_ACTION_INITIAL_STATE,
  );
  const [deleteState, deleteFormAction, isDeleting] = useActionState(
    deleteAlertAction,
    ALERT_ACTION_INITIAL_STATE,
  );

  const state = alertId === null ? createState : deleteState;
  const { successMessage, errorMessage } = state;

  // 音声案内（CLAUDE.md 5章）。読み上げる文言に個人情報は含めない
  useEffect(() => {
    if (successMessage.length > 0) {
      speakComplete(successMessage);
    } else if (errorMessage.length > 0) {
      speakError();
    }
  }, [successMessage, errorMessage]);

  // 最新巻を特定できない作品は通知の対象にできない。
  // フックはすべて呼び終えてから返す
  const latest = group.latest;
  if (latest === null) {
    return null;
  }

  const sales = parseSalesDate(latest.item.salesDate);

  return (
    <div className="space-y-1">
      {alertId === null ? (
        <form action={createFormAction}>
          {/* series_key は必ず group.key を送る。ここで作り直すと
              更新処理が検索結果から同じ作品を見つけられなくなる */}
          <input type="hidden" name="seriesKey" value={group.key} />
          <input type="hidden" name="seriesTitle" value={group.title} />
          <input type="hidden" name="latestTitle" value={latest.item.title} />
          <input type="hidden" name="latestIsbn" value={latest.item.isbn} />
          <input
            type="hidden"
            name="latestVolume"
            value={latest.volume === null ? '' : String(latest.volume)}
          />
          {/* 確定日は date、原文は text。確定できない表記を日付へ
              解釈しないのは parseSalesDate の判断に従う */}
          <input type="hidden" name="releaseDate" value={sales.date ?? ''} />
          <input type="hidden" name="releaseDateText" value={sales.text} />
          <input
            type="hidden"
            name="coverImageUrl"
            value={latest.item.largeImageUrl}
          />

          <button
            type="submit"
            disabled={isCreating}
            className="rounded bg-wood-600 px-3 py-1 text-sm font-medium text-wood-50 hover:bg-wood-700 disabled:opacity-60"
          >
            {isCreating ? '登録中…' : '発売日を通知'}
          </button>
        </form>
      ) : (
        <form action={deleteFormAction}>
          <input type="hidden" name="alertId" value={alertId} />

          <button
            type="submit"
            disabled={isDeleting}
            className="rounded border border-wood-400 px-3 py-1 text-sm font-medium text-wood-100 hover:bg-wood-700 disabled:opacity-60"
          >
            {isDeleting ? '解除中…' : '通知中（解除）'}
          </button>
        </form>
      )}

      {errorMessage.length > 0 && (
        <p role="alert" className="text-sm text-red-300">
          {errorMessage}
        </p>
      )}
      {successMessage.length > 0 && (
        <p role="status" className="text-sm text-wood-100">
          {successMessage}
        </p>
      )}
    </div>
  );
}
