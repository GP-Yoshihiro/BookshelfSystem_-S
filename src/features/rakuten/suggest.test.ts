import { describe, it, expect } from 'vitest';
import { shouldSuggest, toSuggestions, SUGGEST_MIN_LENGTH } from './suggest';
import type { RakutenBookItem } from './types';

function item(title: string): RakutenBookItem {
  return {
    isbn: '9784000000000',
    title,
    titleKana: '',
    author: '',
    publisherName: '',
    size: '',
    booksGenreId: '',
    seriesName: '',
    salesDate: '',
    itemCaption: '',
    largeImageUrl: '',
    itemUrl: '',
  };
}

describe('SUGGEST_MIN_LENGTH', () => {
  it('2文字である', () => {
    expect(SUGGEST_MIN_LENGTH).toBe(2);
  });
});

describe('shouldSuggest', () => {
  it('2文字以上なら候補を出す', () => {
    expect(shouldSuggest('ソー')).toBe(true);
    expect(shouldSuggest('ソード')).toBe(true);
  });

  it('1文字では出さない', () => {
    expect(shouldSuggest('ソ')).toBe(false);
  });

  it('空文字では出さない', () => {
    expect(shouldSuggest('')).toBe(false);
  });

  it('空白のみでは出さない', () => {
    expect(shouldSuggest('  ')).toBe(false);
    expect(shouldSuggest('　　')).toBe(false);
  });

  it('前後の空白は長さに数えない', () => {
    expect(shouldSuggest(' ソ ')).toBe(false);
    expect(shouldSuggest(' ソー ')).toBe(true);
  });
});

describe('toSuggestions', () => {
  it('タイトルを取り出す', () => {
    expect(toSuggestions([item('A'), item('B')], 8)).toEqual(['A', 'B']);
  });

  it('重複するタイトルを除く', () => {
    expect(toSuggestions([item('A'), item('A'), item('B')], 8)).toEqual([
      'A',
      'B',
    ]);
  });

  it('上限件数を超えない', () => {
    const items = [item('A'), item('B'), item('C')];
    expect(toSuggestions(items, 2)).toEqual(['A', 'B']);
  });

  it('空のタイトルは候補にしない', () => {
    expect(toSuggestions([item(''), item('   '), item('A')], 8)).toEqual(['A']);
  });

  it('前後の空白を取り除いてから重複を判定する', () => {
    expect(toSuggestions([item('A'), item('  A  ')], 8)).toEqual(['A']);
  });

  it('候補が無ければ空配列を返す', () => {
    expect(toSuggestions([], 8)).toEqual([]);
  });

  it('上限が0以下なら空配列を返す', () => {
    expect(toSuggestions([item('A')], 0)).toEqual([]);
  });
});
