/**
 * カレンダー描画のための日付計算。
 *
 * month は 1〜12 で扱う。Date が 0 始まりなのは呼び出し側から見て不自然で、
 * 取り違えの原因になるため、この層で吸収する。
 *
 * 日付は UTC で組み立てる。ローカルタイムゾーンで組み立てると、
 * 実行環境によって日がずれることがあるため。
 */

export interface MonthGridCell {
  /** ISO 8601 の日付 (YYYY-MM-DD) */
  date: string;
  day: number;
  /** その月の日か。前後の月から埋めたセルは false */
  isCurrentMonth: boolean;
}

/** 1週間の日数。グリッドは日曜始まり土曜終わり */
const DAYS_PER_WEEK = 7;

/**
 * グリッドの最大週数。
 * 月の日数は最大31日、月初より前の埋めは最大6日なので 37 日 = 6週に必ず収まる。
 */
const MAX_WEEKS = 6;

/** Date を YYYY-MM-DD へ変換する（UTC 基準） */
export function toDateKey(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 月を移動する。12月の翌月は翌年1月、1月の前月は前年12月になる。
 *
 * 0 始まりの通し月へ直してから diff を足し、あふれた分を年へ繰り上げる。
 * 年の繰り上げに Math.floor を使うのは、負の移動でも切り捨て方向を
 * 下向きに揃えるため（Math.trunc だと -1 か月が 0 年移動になってしまう）。
 * 月の剰余に +12 してから再度 %12 するのも、負の剰余を 0〜11 へ戻すため。
 */
export function addMonths(
  year: number,
  month: number,
  diff: number,
): { year: number; month: number } {
  const zeroBased = month - 1 + diff;
  return {
    year: year + Math.floor(zeroBased / 12),
    month: (((zeroBased % 12) + 12) % 12) + 1,
  };
}

export function formatMonthLabel(year: number, month: number): string {
  return `${year}年${month}月`;
}

/**
 * 日〜土の7列からなる週の配列を返す。
 * 月初の前と月末の後は、前後の月の日で埋める（グリッドの形を崩さないため）。
 */
export function buildMonthGrid(year: number, month: number): MonthGridCell[][] {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  // 週は日曜始まり。月初が何曜日かの分だけ前へ戻す
  const start = new Date(firstOfMonth);
  start.setUTCDate(start.getUTCDate() - firstOfMonth.getUTCDay());

  const weeks: MonthGridCell[][] = [];
  const cursor = new Date(start);

  for (let week = 0; week < MAX_WEEKS; week += 1) {
    const cells: MonthGridCell[] = [];
    for (let dayOfWeek = 0; dayOfWeek < DAYS_PER_WEEK; dayOfWeek += 1) {
      cells.push({
        date: toDateKey(cursor),
        day: cursor.getUTCDate(),
        isCurrentMonth: cursor.getUTCMonth() === month - 1,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(cells);

    // cursor は次の週の日曜。そこが既に対象月を過ぎていれば、
    // 次の週は7セルすべてが翌月になる。空の行を作らないためここで打ち切る。
    // 逆に対象月の中にいる限り続けるので、6週必要な月でも月末まで必ず入る。
    if (cursor.getUTCMonth() !== month - 1) {
      break;
    }
  }

  return weeks;
}
