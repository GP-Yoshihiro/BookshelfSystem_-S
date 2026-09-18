import { describe, it, expect } from 'vitest';
import { parseVolume, seriesKey, isExcludedItem } from './series';

describe('parseVolume', () => {
  it('全角カッコの巻数を抽出する', () => {
    expect(parseVolume('薫る花は凛と咲く（24）')).toEqual({
      baseTitle: '薫る花は凛と咲く',
      volume: 24,
    });
  });

  it('半角カッコの巻数を抽出する', () => {
    expect(parseVolume('タイトル(3)')).toEqual({
      baseTitle: 'タイトル',
      volume: 3,
    });
  });

  it('半角スペース区切りの巻数を抽出する', () => {
    expect(parseVolume('呪術廻戦 28')).toEqual({
      baseTitle: '呪術廻戦',
      volume: 28,
    });
  });

  it('全角スペース区切りの巻数を抽出する', () => {
    expect(parseVolume('呪術廻戦　30')).toEqual({
      baseTitle: '呪術廻戦',
      volume: 30,
    });
  });

  it('「第N巻」の表記を抽出する', () => {
    expect(parseVolume('タイトル 第5巻')).toEqual({
      baseTitle: 'タイトル',
      volume: 5,
    });
  });

  it('記号付きの別作品を同一視しない', () => {
    expect(parseVolume('呪術廻戦≡ 3').baseTitle).toBe('呪術廻戦≡');
    expect(parseVolume('呪術廻戦 3').baseTitle).toBe('呪術廻戦');
  });

  it('区切りのない数字を巻数と見なさない', () => {
    expect(parseVolume('ワンピース1')).toEqual({
      baseTitle: 'ワンピース1',
      volume: null,
    });
  });

  it('題名の一部の数字を壊さない', () => {
    expect(parseVolume('ROOM No.1').volume).toBeNull();
    expect(parseVolume('1Q84').volume).toBeNull();
  });

  it('巻数のない題名はそのまま返す', () => {
    expect(parseVolume('ポストカードブック')).toEqual({
      baseTitle: 'ポストカードブック',
      volume: null,
    });
  });

  it('前後の空白を取り除く', () => {
    expect(parseVolume('  タイトル（2）  ')).toEqual({
      baseTitle: 'タイトル',
      volume: 2,
    });
  });

  it('作品名が空になる表記は巻数と見なさない', () => {
    expect(parseVolume('（5）').volume).toBeNull();
  });

  it('空文字でも例外を投げない', () => {
    expect(parseVolume('')).toEqual({ baseTitle: '', volume: null });
  });
});

describe('seriesKey', () => {
  it('同じ作品名は同じキーになる', () => {
    expect(seriesKey('薫る花は凛と咲く')).toBe(seriesKey('薫る花は凛と咲く'));
  });

  it('前後の空白を無視する', () => {
    expect(seriesKey('  タイトル  ')).toBe(seriesKey('タイトル'));
  });

  it('全角空白と半角空白を同一視する', () => {
    expect(seriesKey('ある　題名')).toBe(seriesKey('ある 題名'));
  });

  it('英字の大文字小文字を同一視する', () => {
    expect(seriesKey('Title')).toBe(seriesKey('TITLE'));
  });

  it('別の作品は別のキーになる', () => {
    expect(seriesKey('呪術廻戦')).not.toBe(seriesKey('呪術廻戦≡'));
  });
});

describe('isExcludedItem', () => {
  it('セット商品を除外する', () => {
    expect(isExcludedItem('【全巻】 薫る花は凛と咲く 1-23巻セット')).toBe(true);
  });

  it('まとめ買いを除外する', () => {
    expect(isExcludedItem('タイトル まとめ買い')).toBe(true);
  });

  it('合本を除外する', () => {
    expect(isExcludedItem('タイトル 合本版')).toBe(true);
  });

  it('通常の巻を除外しない', () => {
    expect(isExcludedItem('薫る花は凛と咲く（24）')).toBe(false);
    expect(isExcludedItem('呪術廻戦 28')).toBe(false);
  });

  it('関連グッズは巻数がないだけで除外はしない', () => {
    // 除外語を含まないため false。巻数なしの単独行として扱われる
    expect(isExcludedItem('薫る花は凛と咲く　47都道府県ポストカードブック')).toBe(
      false,
    );
  });

  it('空文字を除外しない', () => {
    expect(isExcludedItem('')).toBe(false);
  });
});
