import { describe, it, expect } from 'vitest';
import { addMonths, buildMonthGrid, type MonthGridCell } from './calendar';

/** グリッドから対象月のセルだけを順番どおり取り出す */
function currentMonthCells(grid: MonthGridCell[][]): MonthGridCell[] {
  return grid.flat().filter((cell) => cell.isCurrentMonth);
}

/** 日付キー (YYYY-MM-DD) の曜日。0 が日曜、6 が土曜 */
function weekdayOf(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

/** noUncheckedIndexedAccess のもとで週を確実に取り出す */
function weekAt(grid: MonthGridCell[][], index: number): MonthGridCell[] {
  const week = grid.at(index);
  if (!week) {
    throw new Error(`週 ${index} が存在しない（週数: ${grid.length}）`);
  }
  return week;
}

describe('addMonths', () => {
  it('同じ年の中で月を進める', () => {
    expect(addMonths(2026, 3, 2)).toEqual({ year: 2026, month: 5 });
  });

  it('12月の翌月は翌年1月になる', () => {
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });

  it('1月の前月は前年12月になる', () => {
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('12か月以上の移動でも年が正しく動く', () => {
    expect(addMonths(2026, 5, -17)).toEqual({ year: 2024, month: 12 });
    expect(addMonths(2026, 5, 20)).toEqual({ year: 2028, month: 1 });
  });
});

describe('buildMonthGrid', () => {
  it('週は日曜で始まり土曜で終わる', () => {
    // 月初の曜日が異なる月をまとめて確認する
    for (const [year, month] of [
      [2026, 9],
      [2026, 2],
      [2024, 2],
      [2026, 12],
    ] as const) {
      const grid = buildMonthGrid(year, month);
      expect(grid.length).toBeGreaterThan(0);

      for (const week of grid) {
        expect(week).toHaveLength(7);
        expect(weekdayOf(week[0]?.date ?? '')).toBe(0);
        expect(weekdayOf(week[6]?.date ?? '')).toBe(6);
      }
    }
  });

  it('月初の前は前月の日で埋める', () => {
    // 2026年9月1日は火曜。先頭2セルは8月30日(日)と31日(月)
    const firstWeek = weekAt(buildMonthGrid(2026, 9), 0);

    expect(firstWeek.slice(0, 3)).toEqual([
      { date: '2026-08-30', day: 30, isCurrentMonth: false },
      { date: '2026-08-31', day: 31, isCurrentMonth: false },
      { date: '2026-09-01', day: 1, isCurrentMonth: true },
    ]);
  });

  it('最終週の月末より後は翌月の日で埋める', () => {
    // 2026年9月30日は水曜。最終週の木〜土は10月で埋まる
    const lastWeek = weekAt(buildMonthGrid(2026, 9), -1);

    expect(lastWeek[3]).toEqual({ date: '2026-09-30', day: 30, isCurrentMonth: true });
    expect(lastWeek.slice(4)).toEqual([
      { date: '2026-10-01', day: 1, isCurrentMonth: false },
      { date: '2026-10-02', day: 2, isCurrentMonth: false },
      { date: '2026-10-03', day: 3, isCurrentMonth: false },
    ]);

    // 2026年2月は1日が日曜・28日が土曜で埋めが不要。
    // 余分な週（7セルすべて翌月）を作らないこと
    const exactGrid = buildMonthGrid(2026, 2);
    expect(exactGrid).toHaveLength(4);
    expect(exactGrid.flat().every((cell) => cell.isCurrentMonth)).toBe(true);
  });

  it('うるう年の2月は29日まである', () => {
    const cells = currentMonthCells(buildMonthGrid(2024, 2));

    expect(cells).toHaveLength(29);
    expect(cells.map((cell) => cell.date)).toEqual(
      Array.from({ length: 29 }, (_, index) => `2024-02-${String(index + 1).padStart(2, '0')}`),
    );
    expect(cells.at(-1)).toEqual({ date: '2024-02-29', day: 29, isCurrentMonth: true });
  });

  it('平年の2月に29日は現れない', () => {
    const grid = buildMonthGrid(2026, 2);
    const cells = currentMonthCells(grid);

    expect(cells).toHaveLength(28);
    expect(cells.at(0)).toEqual({ date: '2026-02-01', day: 1, isCurrentMonth: true });
    expect(cells.at(-1)).toEqual({ date: '2026-02-28', day: 28, isCurrentMonth: true });
    expect(grid.flat().some((cell) => cell.date === '2026-02-29')).toBe(false);
  });
});
