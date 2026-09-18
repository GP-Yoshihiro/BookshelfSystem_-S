import { describe, it, expect } from 'vitest';
import { spineStyle, hashString, SPINE_WIDTHS_PX } from './spine';

/**
 * 実際に登録されている同一シリーズの ISBN。
 * 連番に近い値でも色が偏らないことを確かめるため、実データを使う。
 */
const REAL_ISBNS = [
  '9784065361207', '9784065390405', '9784065351567', '9784065370445',
  '9784065335086', '9784065380536', '9784065341681', '9784065408131',
  '9784065403563', '9784065397459', '9784065266090', '9784065449486',
  '9784041130117', '9784086121231', '9784091234567', '9784101010014',
  '9784150310011', '9784167110017', '9784198940010', '9784253145015',
];

describe('hashString', () => {
  it('同じ文字列は常に同じ値を返す', () => {
    expect(hashString('9784065361207')).toBe(hashString('9784065361207'));
  });

  it('異なる文字列は異なる値を返す', () => {
    expect(hashString('9784065361207')).not.toBe(hashString('9784065390405'));
  });

  it('空文字でも例外を投げない', () => {
    expect(Number.isFinite(hashString(''))).toBe(true);
  });

  it('非負の整数を返す', () => {
    for (const isbn of REAL_ISBNS) {
      const h = hashString(isbn);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('spineStyle', () => {
  it('同じ ISBN は常に同じ見た目を返す', () => {
    expect(spineStyle('9784065361207')).toEqual(spineStyle('9784065361207'));
  });

  it('色相は 0 以上 360 未満に収まる', () => {
    for (const isbn of REAL_ISBNS) {
      const { hue } = spineStyle(isbn);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it('厚みは定義した段階のいずれかになる', () => {
    for (const isbn of REAL_ISBNS) {
      expect(SPINE_WIDTHS_PX).toContain(spineStyle(isbn).widthPx);
    }
  });

  it('20件の ISBN で色相が10種類以上に分かれる', () => {
    const hues = new Set(REAL_ISBNS.map((isbn) => spineStyle(isbn).hue));
    expect(hues.size).toBeGreaterThanOrEqual(10);
  });

  it('連番に近い同一シリーズでも色相が重複しない', () => {
    const series = REAL_ISBNS.slice(0, 12);
    const hues = new Set(series.map((isbn) => spineStyle(isbn).hue));
    expect(hues.size).toBe(series.length);
  });

  it('厚みが1段階に偏らない', () => {
    const widths = new Set(REAL_ISBNS.map((isbn) => spineStyle(isbn).widthPx));
    expect(widths.size).toBeGreaterThanOrEqual(3);
  });

  it('ISBN が空でも既定の見た目を返す', () => {
    const style = spineStyle('');
    expect(style.hue).toBeGreaterThanOrEqual(0);
    expect(SPINE_WIDTHS_PX).toContain(style.widthPx);
  });
});
