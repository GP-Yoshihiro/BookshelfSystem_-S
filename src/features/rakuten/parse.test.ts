import { describe, it, expect } from 'vitest';
import {
  parseSalesDate,
  estimateCategory,
  isOngoingByDefault,
  LIGHT_NOVEL_GENRE_PREFIXES,
} from './parse';

describe('parseSalesDate', () => {
  it('確定日を YYYY-MM-DD へ変換する', () => {
    expect(parseSalesDate('2026年09月10日')).toEqual({
      date: '2026-09-10',
      text: '2026年09月10日',
    });
  });

  it('月日が1桁でも解釈する', () => {
    expect(parseSalesDate('2026年9月5日').date).toBe('2026-09-05');
  });

  it('「頃」が付く月のみの表記は日付にしない', () => {
    expect(parseSalesDate('2026年09月頃')).toEqual({
      date: null,
      text: '2026年09月頃',
    });
  });

  it('季節の表記は日付にしない', () => {
    expect(parseSalesDate('2026年秋')).toEqual({
      date: null,
      text: '2026年秋',
    });
  });

  it('年のみの表記は日付にしない', () => {
    expect(parseSalesDate('2026年').date).toBeNull();
  });

  it('空文字は日付も原文も空として扱う', () => {
    expect(parseSalesDate('')).toEqual({ date: null, text: '' });
  });

  it('存在しない日付は採用しない', () => {
    expect(parseSalesDate('2026年02月30日').date).toBeNull();
  });

  it('原文は常に保持する', () => {
    expect(parseSalesDate('  2026年秋  ').text).toBe('2026年秋');
  });
});

describe('estimateCategory', () => {
  it('size がコミックならコミックと判定する', () => {
    expect(
      estimateCategory({ size: 'コミック', booksGenreId: '001001', seriesName: 'ワンピース' }),
    ).toBe('comic');
  });

  it('コミック判定はシリーズ名より優先される', () => {
    expect(
      estimateCategory({ size: 'コミック', booksGenreId: '', seriesName: 'ある作品' }),
    ).toBe('comic');
  });

  it('ライトノベルのジャンル配下ならライトノベルと判定する', () => {
    const prefix = LIGHT_NOVEL_GENRE_PREFIXES[0];
    expect(prefix).toBeDefined();
    expect(
      estimateCategory({ size: '文庫', booksGenreId: prefix + '01', seriesName: '' }),
    ).toBe('light_novel');
  });

  it('シリーズ名があればシリーズ単行本と判定する', () => {
    expect(
      estimateCategory({ size: '単行本', booksGenreId: '001001', seriesName: 'ある叢書' }),
    ).toBe('series_tankobon');
  });

  it('シリーズ名が空白のみならシリーズ扱いしない', () => {
    expect(
      estimateCategory({ size: '単行本', booksGenreId: '001001', seriesName: '   ' }),
    ).toBe('tankobon');
  });

  it('いずれにも当てはまらなければ単行本と判定する', () => {
    expect(
      estimateCategory({ size: '単行本', booksGenreId: '001001', seriesName: '' }),
    ).toBe('tankobon');
  });
});

describe('isOngoingByDefault', () => {
  it('シリーズ名があり連載可能な分類ならオン', () => {
    expect(isOngoingByDefault('ある作品', 'comic')).toBe(true);
    expect(isOngoingByDefault('ある作品', 'series_tankobon')).toBe(true);
    expect(isOngoingByDefault('ある作品', 'light_novel')).toBe(true);
  });

  it('単行本は DB 制約により常にオフ', () => {
    expect(isOngoingByDefault('ある作品', 'tankobon')).toBe(false);
  });

  it('シリーズ名がなければオフ', () => {
    expect(isOngoingByDefault('', 'comic')).toBe(false);
    expect(isOngoingByDefault('   ', 'comic')).toBe(false);
  });
});
