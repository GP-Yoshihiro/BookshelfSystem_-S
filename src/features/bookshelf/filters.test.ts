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
    // タイトルを別の値にする。同じ値だと localeCompare が 0 を返し、
    // 安定ソートで順序が変わらないため、破壊的な実装でも検知できない
    const books = [book({ id: 'ro', title: 'ろ' }), book({ id: 'a', title: 'あ' })];
    const before = books.map((b) => b.id);

    const sorted = sortBooks(books, 'title', 'asc');

    // ソート結果は並び替わっている（テスト自体が空振りでないことの確認）
    expect(sorted.map((b) => b.id)).toEqual(['a', 'ro']);
    // 元の配列は変わっていない
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

  /**
   * 出版社名をそのまま比べると読み順にならない。localeCompare('ja') は
   * 漢字を読みで並べず、ラテン文字とカナが漢字より前へ来るため、
   * 素の比較では KADOKAWA / マイクロマガジン社 / 講談社 / 秋田書店 の順になる。
   * 読みの表（publisher.ts）を引いて並べ直している。
   */
  it('出版社を五十音順で並べる', () => {
    const books = [
      book({ id: 'haku', publisher: '白泉社' }),
      book({ id: 'shu', publisher: '集英社' }),
      book({ id: 'kado', publisher: 'KADOKAWA' }),
      book({ id: 'sho', publisher: '小学館' }),
      book({ id: 'kou', publisher: '講談社' }),
      book({ id: 'aki', publisher: '秋田書店' }),
      book({ id: 'micro', publisher: 'マイクロマガジン社' }),
    ];
    // 読み: あきた < かどかわ < こうだんしゃ < しゅうえいしゃ
    //       < しょうがくかん < はくせんしゃ < まいくろまがじんしゃ
    expect(sortBooks(books, 'publisher', 'asc').map((b) => b.id)).toEqual([
      'aki',
      'kado',
      'kou',
      'shu',
      'sho',
      'haku',
      'micro',
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

  it('複数条件は AND で結合する', () => {
    const books = [
      book({ id: 'both', category: 'comic', is_ongoing: true }),
      book({ id: 'cat', category: 'comic', is_ongoing: false }),
      book({ id: 'ongoing', category: 'tankobon', is_ongoing: true }),
    ];
    const result = filterBooks(books, {
      ...EMPTY_FILTERS,
      categories: ['comic'],
      onlyOngoing: true,
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

describe('sortBooks: 巻数と作品の並び', () => {
  /**
   * 文字列順だと 1, 10, 11, 2 と並ぶ。実際に本棚がこの並びになっていた。
   * カナに巻数が付かない「ジュジュツカイセン」型の実データを模している。
   */
  it('同じ作品の巻を 1, 2, …, 9, 10, 11 の数値順に並べる', () => {
    const books = [
      book({ id: 'v10', title: '呪術廻戦 10', title_kana: 'ジュジュツカイセン' }),
      book({ id: 'v2', title: '呪術廻戦 2', title_kana: 'ジュジュツカイセン' }),
      book({ id: 'v11', title: '呪術廻戦 11', title_kana: 'ジュジュツカイセン' }),
      book({ id: 'v1', title: '呪術廻戦 1', title_kana: 'ジュジュツカイセン' }),
      book({ id: 'v9', title: '呪術廻戦 9', title_kana: 'ジュジュツカイセン' }),
    ];

    const result = sortBooks(books, 'title', 'asc');

    expect(result.map((b) => b.id)).toEqual(['v1', 'v2', 'v9', 'v10', 'v11']);
  });

  /**
   * カナ側に区切りなしで巻数が付く実データ（トンガリボウシノアトリエ10）。
   * カナをそのまま比べると 10 が 2 より前に来てしまう。
   */
  it('カナの末尾に巻数が付く作品でも数値順になる', () => {
    const books = [
      book({
        id: 'v10',
        title: 'とんがり帽子のアトリエ（10）',
        title_kana: 'トンガリボウシノアトリエ10',
      }),
      book({
        id: 'v2',
        title: 'とんがり帽子のアトリエ（2）',
        title_kana: 'トンガリボウシノアトリエ2',
      }),
      book({
        id: 'v1',
        title: 'とんがり帽子のアトリエ（1）',
        title_kana: 'トンガリボウシノアトリエ1',
      }),
    ];

    const result = sortBooks(books, 'title', 'asc');

    expect(result.map((b) => b.id)).toEqual(['v1', 'v2', 'v10']);
  });

  /**
   * 本編とスピンオフは別作品。巻数を混ぜて並べてはならない。
   * 作品名で分かれるため、本編の全巻が終わってからスピンオフが始まる。
   */
  it('本編とスピンオフの巻を混ぜない', () => {
    const books = [
      book({ id: 'spin2', title: '転生したらスライムだった件　異聞（2）' }),
      book({ id: 'main2', title: '転生したらスライムだった件（2）' }),
      book({ id: 'spin1', title: '転生したらスライムだった件　異聞（1）' }),
      book({ id: 'main10', title: '転生したらスライムだった件（10）' }),
      book({ id: 'main1', title: '転生したらスライムだった件（1）' }),
    ];

    const result = sortBooks(books, 'title', 'asc');

    expect(result.map((b) => b.id)).toEqual([
      'main1',
      'main2',
      'main10',
      'spin1',
      'spin2',
    ]);
  });

  /**
   * 同じ作品名でもライトノベルとコミックスは別物。
   * 分類を巻数より先に見ないと、両者の巻が交互に並ぶ。
   */
  it('作品名が同じでも分類が違えば混ぜない', () => {
    const books = [
      book({ id: 'comic2', title: '転生したらスライムだった件（2）', category: 'comic' }),
      book({ id: 'novel2', title: '転生したらスライムだった件 2', category: 'light_novel' }),
      book({ id: 'comic1', title: '転生したらスライムだった件（1）', category: 'comic' }),
      book({ id: 'novel1', title: '転生したらスライムだった件 1', category: 'light_novel' }),
    ];

    const result = sortBooks(books, 'title', 'asc');

    // CATEGORY_SORT_ORDER はライトノベルがコミックより前
    expect(result.map((b) => b.id)).toEqual([
      'novel1',
      'novel2',
      'comic1',
      'comic2',
    ]);
  });

  /**
   * 巻数を取り出せない本は、その作品の末尾へ置く。
   *
   * 作品名が同じものを並べること。セット商品のように作品名自体が
   * 違うものを使うと、作品名の比較で決着してしまい、巻数の扱いを
   * 検証したことにならない（実際にその誤りで一度素通りした）。
   */
  it('同じ作品名で巻数を持たない本は末尾へ置く', () => {
    const books = [
      book({ id: 'novolume', title: '呪術廻戦' }),
      book({ id: 'v2', title: '呪術廻戦 2' }),
      book({ id: 'v1', title: '呪術廻戦 1' }),
    ];

    const result = sortBooks(books, 'title', 'asc');

    expect(result.map((b) => b.id)).toEqual(['v1', 'v2', 'novolume']);
  });

  /**
   * 実データで起きているケース。同じ「転生したらスライムだった件」でも、
   * マイクロマガジン社のライトノベルと講談社のコミックスは別作品。
   * 楽天のデータでは分類がどちらも comic になっており、分類だけでは分けられない。
   */
  it('作品名も分類も同じでも、出版社が違えば混ぜない', () => {
    const books = [
      book({
        id: 'novel19',
        title: '転生したらスライムだった件　19',
        title_kana: 'テンセイシタラスライムダッタケンジュウキュウ',
        category: 'comic',
        publisher: 'マイクロマガジン社',
      }),
      book({
        id: 'comic23',
        title: '転生したらスライムだった件（23）',
        title_kana: 'テンセイシタラスライムダッタケン23',
        category: 'comic',
        publisher: '講談社',
      }),
      book({
        id: 'novel21',
        title: '転生したらスライムだった件　21',
        title_kana: 'テンセイシタラスライムダッタケンニジュウイチ',
        category: 'comic',
        publisher: 'マイクロマガジン社',
      }),
      book({
        id: 'comic22',
        title: '転生したらスライムだった件（22）',
        title_kana: 'テンセイシタラスライムダッタケン22',
        category: 'comic',
        publisher: '講談社',
      }),
    ];

    const result = sortBooks(books, 'title', 'asc');

    // 出版社ごとにまとまり、巻が交互に現れない
    expect(result.map((b) => b.id)).toEqual([
      'comic22',
      'comic23',
      'novel19',
      'novel21',
    ]);
  });

  /**
   * カナが巻ごとに違う作品でも、ひとまとまりとして扱う。
   * 「…ダッタケンジュウキュウ」のように巻数がカナで綴られると、
   * カナをそのまま比べる実装では作品がばらけてしまう。
   */
  it('巻ごとにカナが違う作品でも、まとまって巻数順になる', () => {
    const books = [
      book({
        id: 'v23',
        title: '転生したらスライムだった件　23',
        title_kana: 'テンセイシタラスライムダッタケンニジュウサン',
        publisher: 'マイクロマガジン社',
      }),
      book({
        id: 'v19',
        title: '転生したらスライムだった件　19',
        title_kana: 'テンセイシタラスライムダッタケンジュウキュウ',
        publisher: 'マイクロマガジン社',
      }),
      book({
        id: 'v21',
        title: '転生したらスライムだった件　21',
        title_kana: 'テンセイシタラスライムダッタケンニジュウイチ',
        publisher: 'マイクロマガジン社',
      }),
    ];

    const result = sortBooks(books, 'title', 'asc');

    expect(result.map((b) => b.id)).toEqual(['v19', 'v21', 'v23']);
  });

  /**
   * 五十音順の確認。localeCompare('ja') は漢字を読みで並べないため、
   * カナが無いと「とんがり帽子」が「薫る花」より前へ出てしまう。
   */
  it('作品どうしはカナの五十音順に並ぶ', () => {
    const books = [
      book({ id: 't', title: 'とんがり帽子のアトリエ（1）', title_kana: 'トンガリボウシノアトリエ1' }),
      book({ id: 'k', title: '薫る花は凛と咲く（1）', title_kana: 'カオルハナハリントサク1' }),
      book({ id: 'te', title: '転生したらスライムだった件（22）', title_kana: 'テンセイシタラスライムダッタケン22' }),
      book({ id: 'j', title: '呪術廻戦 1', title_kana: 'ジュジュツカイセン' }),
    ];

    const result = sortBooks(books, 'title', 'asc');

    // カ → ジ → テ → ト
    expect(result.map((b) => b.id)).toEqual(['k', 'j', 'te', 't']);
  });

  /**
   * 作品の代表カナは「最小巻のもの」に揃える。揃えないと、配列に
   * 最初に現れた巻のカナが代表になり、並べ替えの結果が入力順で変わる。
   * 巻ごとにカナが違う作品（巻数がカナで綴られるもの）で実際に起きる。
   */
  it('入力の順序が違っても同じ並びになる', () => {
    const novel19 = book({
      id: 'v19',
      title: '転生したらスライムだった件　19',
      title_kana: 'テンセイシタラスライムダッタケンジュウキュウ',
      publisher: 'マイクロマガジン社',
    });
    const novel21 = book({
      id: 'v21',
      title: '転生したらスライムだった件　21',
      title_kana: 'テンセイシタラスライムダッタケンニジュウイチ',
      publisher: 'マイクロマガジン社',
    });
    // 代表カナが「…ジュウキュウ」か「…ニジュウイチ」かで、この作品との
    // 前後が入れ替わる位置に置く
    const other = book({
      id: 'other',
      title: 'てんせいしたらすらいむだったけんに',
      title_kana: 'テンセイシタラスライムダッタケンニ',
      publisher: '別の出版社',
    });

    const ascending = sortBooks([novel19, novel21, other], 'title', 'asc');
    const descending = sortBooks([novel21, novel19, other], 'title', 'asc');

    expect(descending.map((b) => b.id)).toEqual(ascending.map((b) => b.id));
  });

  /**
   * 代表カナの末尾から巻数を落とす。落とさないと、本棚に何巻から
   * 入っているかで作品どうしの順序が変わってしまう。
   * 同じ作品名で出版社が違い、開始巻も違う実データの形を模している。
   */
  it('作品どうしの順序が、本棚にある最小巻に左右されない', () => {
    const fromVolume22 = book({
      id: 'a22',
      title: 'ある作品（22）',
      title_kana: 'アルサクヒン22',
      publisher: 'A社',
    });
    const fromVolume10 = book({
      id: 'b10',
      title: 'ある作品（10）',
      title_kana: 'アルサクヒン10',
      publisher: 'B社',
    });

    const result = sortBooks([fromVolume22, fromVolume10], 'title', 'asc');

    // カナの末尾数字を残すと 10 < 22 で B社が先に来る。
    // 落とせばカナは同値になり、出版社の五十音（A社 → B社）で決まる
    expect(result.map((b) => b.id)).toEqual(['a22', 'b10']);
  });

  /** セット商品は作品名が異なるため、その作品の巻の後ろへ並ぶ */
  it('セット商品は本編の巻の後ろに並ぶ', () => {
    const books = [
      book({ id: 'set', title: '薫る花は凛と咲く 1-24巻セット' }),
      book({ id: 'v2', title: '薫る花は凛と咲く（2）' }),
      book({ id: 'v1', title: '薫る花は凛と咲く（1）' }),
    ];

    const result = sortBooks(books, 'title', 'asc');

    expect(result.map((b) => b.id)).toEqual(['v1', 'v2', 'set']);
  });

  /** 出版社別で並べても、同じ出版社の中では作品・巻数の順を保つ */
  it('出版社別でも、同じ出版社の中は作品と巻数の順になる', () => {
    const books = [
      book({ id: 'b10', title: '呪術廻戦 10', publisher: '集英社' }),
      book({ id: 'a1', title: 'とんがり帽子のアトリエ（1）', publisher: '講談社' }),
      book({ id: 'b2', title: '呪術廻戦 2', publisher: '集英社' }),
      book({ id: 'a2', title: 'とんがり帽子のアトリエ（2）', publisher: '講談社' }),
    ];

    const result = sortBooks(books, 'publisher', 'asc');

    // 五十音では「講談社」が「集英社」より先。
    // その中で作品ごとにまとまり、巻数は 2 → 10 の数値順になる
    expect(result.map((b) => b.id)).toEqual(['a1', 'a2', 'b2', 'b10']);
  });

  /** 分類別で並べても、同じ分類の中では作品・巻数の順を保つ */
  it('分類別でも、同じ分類の中は作品と巻数の順になる', () => {
    const books = [
      book({ id: 'c10', title: '呪術廻戦 10', category: 'comic' }),
      book({ id: 'c2', title: '呪術廻戦 2', category: 'comic' }),
      book({ id: 't1', title: 'ある単行本', category: 'tankobon' }),
    ];

    const result = sortBooks(books, 'category', 'asc');

    expect(result.map((b) => b.id)).toEqual(['t1', 'c2', 'c10']);
  });

  /** 降順は全体を反転する。作品の中では 11, 10, 9, … となる */
  it('降順では巻数も逆順になる', () => {
    const books = [
      book({ id: 'v2', title: '呪術廻戦 2' }),
      book({ id: 'v10', title: '呪術廻戦 10' }),
      book({ id: 'v1', title: '呪術廻戦 1' }),
    ];

    const result = sortBooks(books, 'title', 'desc');

    expect(result.map((b) => b.id)).toEqual(['v10', 'v2', 'v1']);
  });
});
