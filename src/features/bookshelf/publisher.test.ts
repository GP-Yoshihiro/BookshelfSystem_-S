import { describe, it, expect } from 'vitest';
import { hasPublisherKana, publisherSortKey } from './publisher';

/** 読みで並べ替えて名前の配列を返す */
function sortByReading(names: readonly string[]): string[] {
  return [...names].sort((left, right) =>
    publisherSortKey(left).localeCompare(publisherSortKey(right), 'ja'),
  );
}

describe('publisherSortKey', () => {
  it('表にある出版社は読みを返す', () => {
    expect(publisherSortKey('講談社')).toBe('コウダンシャ');
    expect(publisherSortKey('集英社')).toBe('シュウエイシャ');
  });

  it('表にない出版社は名前をそのまま返す', () => {
    expect(publisherSortKey('架空出版')).toBe('架空出版');
  });

  it('前後の空白を無視して引ける', () => {
    expect(publisherSortKey(' 講談社 ')).toBe('コウダンシャ');
  });

  /**
   * 漢字のまま比べると アキタ より コウダンシャ が前に来てしまう。
   * 実際に素の localeCompare('ja') はこの順を返す。
   */
  it('漢字の出版社を読みの五十音順に並べる', () => {
    const result = sortByReading([
      '白泉社',
      '集英社',
      '小学館',
      '講談社',
      '秋田書店',
    ]);

    expect(result).toEqual([
      '秋田書店', // アキタショテン
      '講談社', // コウダンシャ
      '集英社', // シュウエイシャ
      '小学館', // ショウガクカン
      '白泉社', // ハクセンシャ
    ]);
  });

  /** カナ名の出版社が、漢字名の出版社の間へ正しく入る */
  it('カナ名の出版社も読みの位置へ並ぶ', () => {
    const result = sortByReading(['マイクロマガジン社', '講談社', '秋田書店']);

    expect(result).toEqual(['秋田書店', '講談社', 'マイクロマガジン社']);
  });

  /** ラテン文字の社名も読みへ置き換える */
  it('KADOKAWA はカドカワの位置へ並ぶ', () => {
    const result = sortByReading(['講談社', 'KADOKAWA', '秋田書店']);

    expect(result).toEqual(['秋田書店', 'KADOKAWA', '講談社']);
  });

  /**
   * 読みが分からない漢字名は末尾へまとまる。
   * ICU の日本語順ではカナが漢字より前に来るため、読みへ置き換わった
   * ものが先に並び、漢字のまま残ったものが後ろへ寄る。
   */
  it('読みが分からない出版社は末尾へまとまる', () => {
    const result = sortByReading(['架空出版', '講談社', '秋田書店']);

    expect(result).toEqual(['秋田書店', '講談社', '架空出版']);
  });
});

describe('hasPublisherKana', () => {
  it('表にあるかを返す', () => {
    expect(hasPublisherKana('講談社')).toBe(true);
    expect(hasPublisherKana('架空出版')).toBe(false);
  });
});
