import { describe, it, expect } from 'vitest';
import {
  sortBooks,
  filterBooks,
  searchBooks,
  EMPTY_FILTERS,
  CATEGORY_SORT_ORDER,
} from './filters';
import type { Book, BookCategory } from '@/types/database';

function book(overrides: Partial<Book>): Book {
  return {
    id: 'id-1',
    user_id: 'user-1',
    isbn: '9784000000000',
    title: 'タイトル',
    title_kana: null,
    author: '著者',
    publisher: '出版社',
    category: 'tankobon',
    is_ongoing: false,
    cover_image_url: null,
    description: null,
    is_purchased: false,
    purchased_at: null,
    latest_release_date: null,
    release_date_text: null,
    item_url: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('CATEGORY_SORT_ORDER', () => {
  it('4分類すべてを含む', () => {
    const expected: BookCategory[] = [
      'tankobon',
      'series_tankobon',
      'light_novel',
      'comic',
    ];
    expect([...CATEGORY_SORT_ORDER]).toEqual(expected);
  });
});

describe('sortBooks', () => {
  it('入力の配列を書き換えない', () => {
    const books = [book({ id: 'b' }), book({ id: 'a' })];
    const before = books.map((b) => b.id);
    sortBooks(books, 'title', 'asc');
    expect(books.map((b) => b.id)).toEqual(before);
  });

  it('分類別に決められた順序で並べる', () => {
    const books = [
      book({ id: 'c', category: 'comic' }),
      book({ id: 't', category: 'tankobon' }),
      book({ id: 'l', category: 'light_novel' }),
    ];
    expect(sortBooks(books, 'category', 'asc').map((b) => b.id)).toEqual([
      't',
      'l',
      'c',
    ]);
  });

  it('降順では分類の順序が逆になる', () => {
    const books = [
      book({ id: 't', category: 'tankobon' }),
      book({ id: 'c', category: 'comic' }),
    ];
    expect(sortBooks(books, 'category', 'desc').map((b) => b.id)).toEqual([
      'c',
      't',
    ]);
  });

  it('出版社を五十音順で並べる', () => {
    const books = [
      book({ id: 'haku', publisher: '白泉社' }),
      book({ id: 'shu', publisher: '集英社' }),
      book({ id: 'kado', publisher: 'KADOKAWA' }),
      book({ id: 'sho', publisher: '小学館' }),
      book({ id: 'kou', publisher: '講談社' }),
    ];
    // 読み: かどかわ < こうだんしゃ < しゅうえいしゃ < しょうがくかん < はくせんしゃ
    // ICU の日本語照合は漢字を読みで並べるため、この順序になる
    expect(sortBooks(books, 'publisher', 'asc').map((b) => b.id)).toEqual([
      'kado',
      'kou',
      'shu',
      'sho',
      'haku',
    ]);
  });

  it('タイトルはカナがあればカナで並べる', () => {
    const books = [
      book({ id: 'b', title: '薫る花', title_kana: 'カオルハナ' }),
      book({ id: 'a', title: '青い鳥', title_kana: 'アオイトリ' }),
    ];
    expect(sortBooks(books, 'title', 'asc').map((b) => b.id)).toEqual([
      'a',
      'b',
    ]);
  });

  it('カナが無い書籍もソート結果から消えない', () => {
    const books = [
      book({ id: 'kana', title: '薫る花', title_kana: 'カオルハナ' }),
      book({ id: 'nokana', title: '青い鳥', title_kana: null }),
      book({ id: 'empty', title: '海辺', title_kana: '' }),
    ];
    const sorted = sortBooks(books, 'title', 'asc');
    expect(sorted).toHaveLength(3);
    expect(sorted.map((b) => b.id).sort()).toEqual(['empty', 'kana', 'nokana']);
  });

  it('空配列を渡しても例外を投げない', () => {
    expect(sortBooks([], 'title', 'asc')).toEqual([]);
  });
});

describe('filterBooks', () => {
  it('EMPTY_FILTERS では絞り込まない', () => {
    const books = [book({ id: 'a' }), book({ id: 'b' })];
    expect(filterBooks(books, EMPTY_FILTERS)).toHaveLength(2);
  });

  it('分類で絞り込む', () => {
    const books = [
      book({ id: 'c', category: 'comic' }),
      book({ id: 't', category: 'tankobon' }),
    ];
    const result = filterBooks(books, {
      ...EMPTY_FILTERS,
      categories: ['comic'],
    });
    expect(result.map((b) => b.id)).toEqual(['c']);
  });

  it('出版社で絞り込む', () => {
    const books = [
      book({ id: 'k', publisher: '講談社' }),
      book({ id: 's', publisher: '集英社' }),
    ];
    const result = filterBooks(books, {
      ...EMPTY_FILTERS,
      publishers: ['集英社'],
    });
    expect(result.map((b) => b.id)).toEqual(['s']);
  });

  it('連載中で絞り込む', () => {
    const books = [
      book({ id: 'on', is_ongoing: true }),
      book({ id: 'off', is_ongoing: false }),
    ];
    const result = filterBooks(books, { ...EMPTY_FILTERS, onlyOngoing: true });
    expect(result.map((b) => b.id)).toEqual(['on']);
  });

  it('購入済みで絞り込む', () => {
    const books = [
      book({ id: 'yes', is_purchased: true }),
      book({ id: 'no', is_purchased: false }),
    ];
    const result = filterBooks(books, {
      ...EMPTY_FILTERS,
      onlyPurchased: true,
    });
    expect(result.map((b) => b.id)).toEqual(['yes']);
  });

  it('複数条件は AND で結合する', () => {
    const books = [
      book({ id: 'both', category: 'comic', is_purchased: true }),
      book({ id: 'cat', category: 'comic', is_purchased: false }),
      book({ id: 'buy', category: 'tankobon', is_purchased: true }),
    ];
    const result = filterBooks(books, {
      ...EMPTY_FILTERS,
      categories: ['comic'],
      onlyPurchased: true,
    });
    expect(result.map((b) => b.id)).toEqual(['both']);
  });

  it('入力の配列を書き換えない', () => {
    const books = [book({ id: 'a', category: 'comic' })];
    filterBooks(books, { ...EMPTY_FILTERS, categories: ['tankobon'] });
    expect(books).toHaveLength(1);
  });
});

describe('searchBooks', () => {
  it('空文字では全件を返す', () => {
    const books = [book({ id: 'a' }), book({ id: 'b' })];
    expect(searchBooks(books, '')).toHaveLength(2);
  });

  it('空白のみでも全件を返す', () => {
    const books = [book({ id: 'a' })];
    expect(searchBooks(books, '　 ')).toHaveLength(1);
  });

  it('タイトルの部分一致で絞り込む', () => {
    const books = [
      book({ id: 'hit', title: '薫る花は凛と咲く' }),
      book({ id: 'miss', title: '青い鳥' }),
    ];
    expect(searchBooks(books, '薫る').map((b) => b.id)).toEqual(['hit']);
  });

  it('著者でも一致する', () => {
    const books = [
      book({ id: 'hit', author: '三香' }),
      book({ id: 'miss', author: '別人' }),
    ];
    expect(searchBooks(books, '三香').map((b) => b.id)).toEqual(['hit']);
  });

  it('出版社でも一致する', () => {
    const books = [
      book({ id: 'hit', publisher: '講談社' }),
      book({ id: 'miss', publisher: '集英社' }),
    ];
    expect(searchBooks(books, '講談').map((b) => b.id)).toEqual(['hit']);
  });

  it('英字は大文字小文字を区別しない', () => {
    const books = [book({ id: 'hit', publisher: 'KADOKAWA' })];
    expect(searchBooks(books, 'kadokawa').map((b) => b.id)).toEqual(['hit']);
  });

  it('一致しなければ空配列を返す', () => {
    expect(searchBooks([book({ id: 'a' })], 'あり得ない語')).toEqual([]);
  });
});
