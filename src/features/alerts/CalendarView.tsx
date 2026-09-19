'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useMemo, useState } from 'react';
import { speakComplete, speakError } from '@/lib/speech';
import type { ReleaseAlert } from '@/types/database';
import { deleteAlertAction } from './actions';
import { addMonths, buildMonthGrid, formatMonthLabel } from './calendar';
import { ALERT_ACTION_INITIAL_STATE } from './state';

/** 表示中の年月。month は 1〜12（calendar.ts の約束に合わせる） */
interface ViewingMonth {
  year: number;
  month: number;
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** 1つのセルに並べる作品名の上限。超えた分は「他N件」にまとめる */
const MAX_CELL_TITLES = 2;

/**
 * Date を YYYY-MM-DD へ変換する（★ローカル基準★）。
 *
 * calendar.ts の toDateKey は UTC 基準のため、これを「今日」の判定に使っては
 * ならない。日本時間の朝は UTC ではまだ前日で、前日が「今日」として
 * 光ってしまう。今日だけはローカルの年月日から組み立てる。
 *
 * グリッドのセルの date は「その日を指すラベル」であってタイムスタンプでは
 * ないため、UTC で組み立てられたセルのキーと文字列として突き合わせて問題ない。
 */
function toLocalDateKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** YYYY-MM-DD を「2026年10月5日」へ。文字列のまま分解するのでズレない */
function formatReleaseLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-');
  if (year === undefined || month === undefined || day === undefined) {
    return dateKey;
  }
  return `${Number(year)}年${Number(month)}月${Number(day)}日`;
}

/** 巻数が分かっていれば「（第5巻）」を添える */
function formatVolume(volume: number | null): string {
  return volume === null ? '' : `（第${volume}巻）`;
}

export function CalendarView({ alerts }: { alerts: readonly ReleaseAlert[] }) {
  /**
   * 「今日」と初期表示の年月は、描画開始時ではなくマウント後に決める。
   *
   * このコンポーネントはサーバでも一度描画される。そこで new Date() を読むと
   * サーバのタイムゾーン（多くは UTC）の日付が HTML に焼き付き、日本時間の
   * ブラウザで再計算した結果と食い違ってハイドレーションが壊れる。
   * 月をまたぐ時間帯には月の見出しごとずれる。
   * 確定するまでは null とし、その間は読み込み中の案内を出す。
   */
  const [today, setToday] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ViewingMonth | null>(null);

  useEffect(() => {
    const now = new Date();
    setToday(toLocalDateKey(now));
    // 月の移動はクライアント側の状態で行うため、利用者が動かしたあとの
    // 年月を初期値で踏み潰さないようにする
    setViewing(
      (current) =>
        current ?? { year: now.getFullYear(), month: now.getMonth() + 1 },
    );
  }, []);

  /** 発売日ごとの作品。発売日が未確定のものはカレンダーへ置けない */
  const alertsByDate = useMemo(() => {
    const map = new Map<string, ReleaseAlert[]>();
    for (const alert of alerts) {
      const date = alert.latest_release_date;
      if (date === null) {
        continue;
      }
      const sameDay = map.get(date);
      if (sameDay === undefined) {
        map.set(date, [alert]);
      } else {
        sameDay.push(alert);
      }
    }
    return map;
  }, [alerts]);

  /**
   * 下部のリスト用の仕分け。
   * これから発売（今日を含む）は近い順、発売済みは新しい順、
   * 発売日未定は最後。
   */
  const groupedAlerts = useMemo(() => {
    const upcoming: ReleaseAlert[] = [];
    const released: ReleaseAlert[] = [];
    const undated: ReleaseAlert[] = [];

    for (const alert of alerts) {
      const date = alert.latest_release_date;
      if (date === null) {
        undated.push(alert);
      } else if (today !== null && date < today) {
        released.push(alert);
      } else {
        upcoming.push(alert);
      }
    }

    // YYYY-MM-DD は桁が揃っているので、文字列の大小がそのまま日付順になる
    upcoming.sort((a, b) =>
      (a.latest_release_date ?? '').localeCompare(b.latest_release_date ?? ''),
    );
    released.sort((a, b) =>
      (b.latest_release_date ?? '').localeCompare(a.latest_release_date ?? ''),
    );

    return { upcoming, released, undated };
  }, [alerts, today]);

  const weeks = useMemo(
    () => (viewing === null ? [] : buildMonthGrid(viewing.year, viewing.month)),
    [viewing],
  );

  function moveMonth(diff: number) {
    setViewing((current) =>
      current === null ? null : addMonths(current.year, current.month, diff),
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-wood-50">発売日カレンダー</h1>
        {/*
          ここに「本を追加」は置かない。発売日の通知は本棚への追加とは別物で、
          登録は検索画面からしか行えないため、導線は /search へのリンクにする
        */}
        <Link
          href="/search"
          className="rounded bg-wood-600 px-3 py-1 text-sm font-medium text-wood-50 hover:bg-wood-700"
        >
          本を探して通知を登録
        </Link>
      </div>

      {viewing === null ? (
        <p role="status" className="rounded bg-wood-800 p-4 text-sm text-wood-100">
          カレンダーを準備しています…
        </p>
      ) : (
        <section
          aria-label="月間カレンダー"
          className="space-y-3 rounded bg-wood-800 p-3 shadow-shelf"
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              className="rounded border border-wood-400 px-3 py-1 text-sm text-wood-100 hover:bg-wood-700"
            >
              前月
            </button>
            <p aria-live="polite" className="text-lg font-bold text-wood-50">
              {formatMonthLabel(viewing.year, viewing.month)}
            </p>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              className="rounded border border-wood-400 px-3 py-1 text-sm text-wood-100 hover:bg-wood-700"
            >
              翌月
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-wood-200">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label}>{label}</div>
            ))}
          </div>

          <div className="space-y-1">
            {weeks.map((week) => (
              <div key={week[0]?.date ?? ''} className="grid grid-cols-7 gap-1">
                {week.map((cell) => {
                  const cellAlerts = alertsByDate.get(cell.date) ?? [];
                  const isToday = cell.date === today;
                  return (
                    <div
                      key={cell.date}
                      aria-label={`${formatReleaseLabel(cell.date)}${
                        cellAlerts.length > 0
                          ? ` 発売${cellAlerts.length}件`
                          : ''
                      }`}
                      className={`min-h-16 rounded p-1 text-left ${
                        cell.isCurrentMonth
                          ? 'bg-wood-700 text-wood-50'
                          : 'bg-wood-800 text-wood-300'
                      } ${isToday ? 'ring-2 ring-wood-100' : ''}`}
                    >
                      <span className="text-xs font-medium">{cell.day}</span>
                      {cellAlerts.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {cellAlerts.slice(0, MAX_CELL_TITLES).map((alert) => (
                            <li
                              key={alert.id}
                              title={alert.series_title}
                              className="truncate rounded bg-wood-200 px-1 text-[10px] leading-4 text-wood-900"
                            >
                              {alert.series_title}
                            </li>
                          ))}
                          {cellAlerts.length > MAX_CELL_TITLES && (
                            <li className="text-[10px] leading-4 text-wood-100">
                              他{cellAlerts.length - MAX_CELL_TITLES}件
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      )}

      {alerts.length === 0 ? (
        <p
          role="status"
          className="rounded bg-wood-800 p-4 text-sm text-wood-100"
        >
          発売日の通知はまだ登録されていません。
          <Link href="/search" className="underline hover:text-wood-50">
            本を探す
          </Link>
          から作品を検索して、「発売日を通知」で登録できます。
        </p>
      ) : (
        // 「これから」と「発売済み」の仕分けには今日が要る。確定するまで出さないのは、
        // 発売済みの作品を一瞬でも「これから発売」に並べないため
        today !== null && (
          <div className="space-y-4">
            <AlertSection
              heading="これから発売"
              alerts={groupedAlerts.upcoming}
            />
            <AlertSection heading="発売済み" alerts={groupedAlerts.released} />
            <AlertSection heading="発売日未定" alerts={groupedAlerts.undated} />
          </div>
        )
      )}
    </div>
  );
}

/** 見出し付きのリスト。中身が無い区分は出さない */
function AlertSection({
  heading,
  alerts,
}: {
  heading: string;
  alerts: readonly ReleaseAlert[];
}) {
  if (alerts.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold text-wood-200">
        {heading}（{alerts.length}件）
      </h2>
      <ul className="space-y-2">
        {alerts.map((alert) => (
          <li key={alert.id}>
            <AlertRow alert={alert} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * リストの1行。解除ボタンに確認を内蔵する。
 *
 * 解除すると元に戻せず、検索し直して登録し直す必要があるため、
 * DeleteBookButton と同じく必ず確認を挟み、何を解除しようとしているのか
 * 作品名で示す。
 *
 * 行ごとに useActionState を持つのは、1つの状態を共有すると
 * どの行の結果なのか区別できなくなるため。
 */
function AlertRow({ alert }: { alert: ReleaseAlert }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    deleteAlertAction,
    ALERT_ACTION_INITIAL_STATE,
  );
  const [isConfirming, setIsConfirming] = useState(false);

  const { successMessage, errorMessage } = state;

  // 音声案内（CLAUDE.md 5章）。読み上げる文言に個人情報は含めない
  useEffect(() => {
    if (successMessage.length > 0) {
      speakComplete(successMessage);
      // Server Action がキャッシュを無効化しているので、読み直せば行が消える
      router.refresh();
      return;
    }
    if (errorMessage.length > 0) {
      speakError();
    }
  }, [successMessage, errorMessage, router]);

  const releaseDate = alert.latest_release_date;
  const releaseText = alert.latest_release_date_text;

  return (
    <div className="space-y-2 rounded bg-wood-800 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-wood-50">{alert.series_title}</p>
          <p className="text-sm text-wood-100">
            {alert.latest_title}
            {formatVolume(alert.latest_volume)}
          </p>
          <p className="text-sm text-wood-200">
            {releaseDate === null
              ? // 確定した発売日が無い場合、原文があればそのまま見せる。
                // 「2026年秋」のような表記を日付へ解釈しないのは登録側と同じ判断
                `発売日未定${releaseText === null ? '' : `（${releaseText}）`}`
              : formatReleaseLabel(releaseDate)}
          </p>
        </div>

        {!isConfirming && (
          <button
            type="button"
            onClick={() => setIsConfirming(true)}
            className="rounded border border-wood-400 px-3 py-1 text-sm font-medium text-wood-100 hover:bg-wood-700"
          >
            通知を解除
          </button>
        )}
      </div>

      {isConfirming && (
        <form action={formAction} className="space-y-2 rounded bg-wood-900 p-3">
          <input type="hidden" name="alertId" value={alert.id} />
          <p className="text-sm text-wood-100">
            「{alert.series_title}」の発売日通知を解除します。
            元に戻すには検索し直して登録する必要があります。
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsConfirming(false)}
              className="rounded border border-wood-400 px-3 py-1 text-sm text-wood-100"
            >
              やめる
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded bg-red-800 px-3 py-1 text-sm font-medium text-wood-50 hover:bg-red-700 disabled:opacity-60"
            >
              {isPending ? '解除中…' : '解除する'}
            </button>
          </div>
        </form>
      )}

      {errorMessage.length > 0 && (
        <p
          role="alert"
          className="rounded bg-red-900 px-2 py-1 text-sm text-red-100"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
