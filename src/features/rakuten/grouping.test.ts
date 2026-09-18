import { describe, it, expect } from 'vitest';
import { groupBySeries, splitExcluded } from './grouping';
import type { RakutenBookItem } from './types';

function item(title: string, salesDate = '2026年01月01日'): RakutenBookItem {
  return {
    isbn: `isbn-${title}`,
    title,
    titleKana: '',
    author: '著者',
    publisherName: '出版社',
    size: 'コミック',
    booksGenreId: '001001',
    seriesName: '講談社コミックス',
    salesDate,
    itemCaption: '',
    largeImageUrl: '',
    itemUrl: '',
  };
}

describe('splitExcluded', () => {
  it('セット商品を除外側へ分ける', () => {
    const result = splitExcluded([
      item('薫る花は凛と咲く（1）'),
      item('【全巻】 薫る花は凛と咲く 1-23巻セット'),
    ]);
    expect(result.kept).toHaveLength(1);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]?.title).toContain('セット');
  });

  it('除外対象がなければ excluded は空になる', () => {
    const result = splitExcluded([item('タイトル（1）')]);
    expect(result.kept).toHaveLength(1);
    expect(result.excluded).toEqual([]);
  });

  it('入力の配列を書き換えない', () => {
    const items = [item('タイトル（1）'), item('セット商品')];
    splitExcluded(items);
    expect(items).toHaveLength(2);
  });
});

describe('groupBySeries', () => {
  it('同じ作品の巻を1つにまとめる', () => {
    const groups = groupBySeries([
      item('薫る花は凛と咲く（3）'),
      item('薫る花は凛と咲く（1）'),
      item('薫る花は凛と咲く（2）'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.title).toBe('薫る花は凛と咲く');
    expect(groups[0]?.entries).toHaveLength(3);
  });

  it('巻を昇順に並べる', () => {
    const groups = groupBySeries([
      item('タイトル（3）'),
      item('タイトル（1）'),
      item('タイトル（2）'),
    ]);
    expect(groups[0]?.entries.map((e) => e.volume)).toEqual([1, 2, 3]);
  });

  it('代表は最小巻になる', () => {
    const groups = groupBySeries([item('タイトル（5）'), item('タイトル（2）')]);
    expect(groups[0]?.representative.title).toBe('タイトル（2）');
  });

  it('最新巻は巻数が最大のものになる', () => {
    const groups = groupBySeries([
      item('タイトル（2）', '2026年12月01日'),
      item('タイトル（10）', '2020年01月01日'),
    ]);
    expect(groups[0]?.latest?.volume).toBe(10);
  });

  it('記号付きの別作品を別グループにする', () => {
    const groups = groupBySeries([
      item('呪術廻戦 1'),
      item('呪術廻戦 2'),
      item('呪術廻戦≡ 1'),
    ]);
    expect(groups).toHaveLength(2);
    const titles = groups.map((g) => g.title).sort();
    expect(titles).toEqual(['呪術廻戦', '呪術廻戦≡']);
  });

  it('1件だけの作品は単独として印を付ける', () => {
    const groups = groupBySeries([item('単独作品（1）')]);
    expect(groups[0]?.isSingle).toBe(true);
  });

  it('2件以上あれば単独ではない', () => {
    const groups = groupBySeries([item('タイトル（1）'), item('タイトル（2）')]);
    expect(groups[0]?.isSingle).toBe(false);
  });

  it('巻数のない商品も1つのグループとして残す', () => {
    const groups = groupBySeries([item('ポストカードブック')]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.latest).toBeNull();
    expect(groups[0]?.isSingle).toBe(true);
  });

  it('巻数のない商品は巻のある商品の後ろへ並べる', () => {
    const groups = groupBySeries([
      item('タイトル 特別編'),
      item('タイトル（1）'),
    ]);
    // 「タイトル 特別編」は巻数を抽出できないため別グループになる
    expect(groups).toHaveLength(2);
  });

  it('元の配列を書き換えない', () => {
    const items = [item('タイトル（2）'), item('タイトル（1）')];
    const before = items.map((i) => i.title);
    groupBySeries(items);
    expect(items.map((i) => i.title)).toEqual(before);
  });

  it('空配列を渡しても例外を投げない', () => {
    expect(groupBySeries([])).toEqual([]);
  });
});
