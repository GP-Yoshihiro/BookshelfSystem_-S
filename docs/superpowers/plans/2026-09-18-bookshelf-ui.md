# 木製本棚UI 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 登録済みの書籍を木製本棚に背表紙で並べ、ソート・絞り込み・検索で辿り着けるようにし、詳細ページへ遷移できるようにする。

**Architecture:** 背表紙は楽天が画像を返さないため CSS で生成する。色と厚みは ISBN から決定的に算出する。ソート・絞り込み・検索はすべてブラウザ側で行い、通信を伴わない。純粋関数を切り出して TDD で固める。

**Tech Stack:** Next.js 15.5 / React 19 / TypeScript strict / Tailwind CSS 3 / Vitest

**Spec:** `docs/superpowers/specs/2026-09-18-bookshelf-ui-design.md`

## Global Constraints

- 対話・ドキュメント・コメント・コミットメッセージはすべて日本語。コード内の識別子は英語
- TypeScript strict モード。`any` の使用は禁止（`@typescript-eslint/no-explicit-any: error`）
- `tsconfig.json` は `noUncheckedIndexedAccess` / `noUnusedLocals` / `noUnusedParameters` が有効。**配列アクセスの結果は `T | undefined` になる**
- **`'use server'` ファイルは async 関数以外を export できない。** 定数は別ファイルへ置く。破るとビルドが `TypeError` で落ちる
- 楽天由来の文字列を `dangerouslySetInnerHTML` で描画しない
- `console.error(error)` のようにエラーオブジェクトをそのまま出力しない
- パス別名 `@/*` は `./src/*` を指す
- コミット前に `npm run typecheck` / `npm run lint` / `npm test` / `npm run build` がすべてエラーなしであること
- **開発サーバーの稼働中に `npm run build` を実行しないこと。** `.next` が壊れ CSS が当たらなくなる。実行前に必ずサーバーを止めること
- `npm install` を実行しないこと（`@vitejs/plugin-react` が 5.2.0 に固定されており壊れる）
- コミットメッセージ末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- 作業ブランチは `feature/bookshelf-ui`。`main` へのマージは人間の承認を得てから

## 既存コードの前提

```ts
// src/types/database.ts
export type BookCategory = 'tankobon' | 'series_tankobon' | 'light_novel' | 'comic';
export const BOOK_CATEGORY_LABELS: Readonly<Record<BookCategory, string>>;
export const ONGOING_CAPABLE_CATEGORIES: readonly BookCategory[];
export type Book = {
  id: string; user_id: string; isbn: string; title: string;
  title_kana: string | null; author: string; publisher: string;
  category: BookCategory; is_ongoing: boolean;
  cover_image_url: string | null; description: string | null;
  is_purchased: boolean; purchased_at: string | null;
  latest_release_date: string | null; release_date_text: string | null;
  item_url: string | null; created_at: string; updated_at: string;
};

// src/features/books/cache.ts
export async function getUserBooks(userId: string): Promise<Book[]>;
// ★ userId は必ず supabase.auth.getUser() から取得したものを渡すこと。
//   RLS を迂回する管理者クライアントを使っているため（工程D設計書 8.1 規則1）

// src/lib/supabase/server.ts
export async function createClient(): Promise<SupabaseClient<Database>>; // 要 await
```

Tailwind 設定に `wood` カラー（50〜900）、`shadow-book` / `shadow-shelf`、`bg-wood-grain` が定義済み。

`src/app/(app)/page.tsx` は現在プレースホルダのページ。本タスクで本棚へ置き換える。

## ファイル構成

| ファイル | 責務 |
| --- | --- |
| `src/features/bookshelf/spine.ts` | ISBN から背表紙の色と厚みを算出（純粋関数） |
| `src/features/bookshelf/filters.ts` | ソート・絞り込み・検索（純粋関数） |
| `src/features/bookshelf/BookSpine.tsx` | 背表紙1冊 |
| `src/features/bookshelf/Bookshelf.tsx` | 棚板とグリッド、0冊時の表示 |
| `src/features/bookshelf/BookPreview.tsx` | 表紙と概要のパネル |
| `src/features/bookshelf/BookshelfControls.tsx` | ソート・絞り込み・検索のUI |
| `src/features/bookshelf/BookshelfView.tsx` | 状態を持ち全体を束ねる |
| `src/app/(app)/page.tsx` | 本棚ページ（差し替え） |
| `src/app/(app)/books/[id]/page.tsx` | 書籍詳細ページ |

---

### Task 1: 背表紙の色と厚み

**Files:**
- Create: `src/features/bookshelf/spine.ts`
- Test: `src/features/bookshelf/spine.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `interface SpineStyle { hue: number; widthPx: number }`
  - `SPINE_WIDTHS_PX: readonly number[]`
  - `hashString(value: string): number`
  - `spineStyle(isbn: string): SpineStyle`

**設計の要点:** 同じ本が常に同じ見た目になること。ランダムだと再読み込みで色が変わり、
「あの赤い本」という見た目の記憶が使えなくなる。

- [ ] **Step 1: 失敗するテストを書く**

`src/features/bookshelf/spine.test.ts`:

```ts
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
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test -- spine`
Expected: FAIL — `Failed to resolve import "./spine"`

- [ ] **Step 3: 実装を書く**

`src/features/bookshelf/spine.ts`:

```ts
/**
 * 背表紙の見た目を ISBN から決定的に算出する純粋関数。
 *
 * 楽天ブックスAPIは背表紙の画像を提供しないため、背表紙は CSS で生成する。
 * その色と厚みをここで決める。
 *
 * ランダムに決めないのは、再読み込みのたびに色が変わると
 * 「あの赤い本」という見た目の記憶で探せなくなるため。
 * 分類ごとの色にしないのは、同じ分類の本がすべて同色になり
 * 見分けがつかなくなるため。
 */

/** 背表紙の厚みの段階（px） */
export const SPINE_WIDTHS_PX: readonly number[] = [34, 40, 46, 52];

export interface SpineStyle {
  /** 色相（0-359）。彩度と明度は描画側で固定する */
  hue: number;
  /** 背表紙の幅（px） */
  widthPx: number;
}

/**
 * djb2 による文字列ハッシュ。
 * 暗号用途ではなく見た目の振り分けにのみ使う。
 * 32ビット符号なしへ丸めて非負を保証する。
 */
export function hashString(value: string): number {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    // hash * 33 + charCode
    hash = (hash << 5) + hash + value.charCodeAt(index);
    // 32ビット符号なしへ都度丸める。丸めないと精度が落ちて衝突が増える
    hash >>>= 0;
  }
  return hash;
}

/**
 * ISBN から背表紙の色相と厚みを決める。
 *
 * 色相と厚みでハッシュの異なるビットを使うのは、両者が相関して
 * 「同じ色の本は必ず同じ厚み」になるのを避けるため。
 * 上位ビットを使う位置は、実在する同一シリーズの ISBN 20件で
 * 分散を確かめて選んでいる。
 */
export function spineStyle(isbn: string): SpineStyle {
  const hash = hashString(isbn);
  const widthIndex = (hash >>> 16) % SPINE_WIDTHS_PX.length;
  // noUncheckedIndexedAccess のため undefined を排除する
  const widthPx = SPINE_WIDTHS_PX[widthIndex] ?? 40;

  return {
    hue: hash % 360,
    widthPx,
  };
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test -- spine`
Expected: PASS（11 テスト）

- [ ] **Step 5: 型チェックと lint を通す**

Run: `npm run typecheck && npm run lint`
Expected: どちらもエラーなし

- [ ] **Step 6: コミット**

```bash
git add src/features/bookshelf/spine.ts src/features/bookshelf/spine.test.ts
git commit -m "$(cat <<'EOF'
feat: 背表紙の色と厚みをISBNから算出する

楽天は背表紙画像を提供しないため CSS で生成する。その見た目を ISBN から
決定的に決める。ランダムだと再読み込みで色が変わり「あの赤い本」という
見た目の記憶で探せなくなるため。分類ごとの色にしないのは、同じ分類の本が
すべて同色になり見分けがつかなくなるため。

色相と厚みはハッシュの異なるビットから取る。相関すると「同じ色の本は
必ず同じ厚み」になり単調に見えるため。実在する同一シリーズの ISBN で
分散を確認したうえでビット位置を選んでいる。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: ソート・絞り込み・検索

**Files:**
- Create: `src/features/bookshelf/filters.ts`
- Test: `src/features/bookshelf/filters.test.ts`

**Interfaces:**
- Consumes: `Book` / `BookCategory`（`@/types/database`）
- Produces:
  - `type SortKey = 'category' | 'publisher' | 'title'`
  - `type SortOrder = 'asc' | 'desc'`
  - `interface BookFilters { categories: readonly BookCategory[]; publishers: readonly string[]; onlyOngoing: boolean; onlyPurchased: boolean }`
  - `EMPTY_FILTERS: BookFilters`
  - `CATEGORY_SORT_ORDER: readonly BookCategory[]`
  - `sortBooks(books: readonly Book[], key: SortKey, order: SortOrder): Book[]`
  - `filterBooks(books: readonly Book[], filters: BookFilters): Book[]`
  - `searchBooks(books: readonly Book[], query: string): Book[]`

**設計の要点:** 入力の配列を破壊しないこと。React の state をそのまま渡すため、
変更すると再描画が壊れる。

- [ ] **Step 1: 失敗するテストを書く**

`src/features/bookshelf/filters.test.ts`:

```ts
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
      book({ id: 'k', publisher: '講談社' }),
      book({ id: 'a', publisher: 'KADOKAWA' }),
      book({ id: 's', publisher: '集英社' }),
    ];
    const sorted = sortBooks(books, 'publisher', 'asc').map((b) => b.id);
    expect(sorted).toHaveLength(3);
    expect(sorted.indexOf('s')).toBeLessThan(sorted.indexOf('k'));
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
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test -- filters`
Expected: FAIL — `Failed to resolve import "./filters"`

- [ ] **Step 3: 実装を書く**

`src/features/bookshelf/filters.ts`:

```ts
/**
 * 本棚のソート・絞り込み・検索を行う純粋関数。
 *
 * すべてブラウザ側で処理する。README が求めるリアルタイム検索を
 * 体感ゼロで実現でき、Supabase へのリクエストも増えないため。
 *
 * どの関数も入力の配列を書き換えない。React の state をそのまま
 * 渡すため、破壊すると再描画が壊れる。
 */

import type { Book, BookCategory } from '@/types/database';

export type SortKey = 'category' | 'publisher' | 'title';
export type SortOrder = 'asc' | 'desc';

/** 分類別ソートの並び順。薄い本から厚い本、という直感に合わせている */
export const CATEGORY_SORT_ORDER: readonly BookCategory[] = [
  'tankobon',
  'series_tankobon',
  'light_novel',
  'comic',
];

export interface BookFilters {
  categories: readonly BookCategory[];
  publishers: readonly string[];
  onlyOngoing: boolean;
  onlyPurchased: boolean;
}

/** 何も絞り込まない状態 */
export const EMPTY_FILTERS: BookFilters = {
  categories: [],
  publishers: [],
  onlyOngoing: false,
  onlyPurchased: false,
};

/** 日本語を含む文字列の比較 */
function compareJa(left: string, right: string): number {
  return left.localeCompare(right, 'ja');
}

/**
 * タイトル比較に使う文字列。
 *
 * 楽天が titleKana を返さない書籍があるため、無ければタイトル本体を使う。
 * カナが無いものを末尾へ固めると、探している本が見つからなくなる。
 * 並びは多少乱れるが、本が行方不明になるよりは良い。
 */
function titleSortKey(target: Book): string {
  const kana = target.title_kana?.trim() ?? '';
  return kana.length > 0 ? kana : target.title;
}

export function sortBooks(
  books: readonly Book[],
  key: SortKey,
  order: SortOrder,
): Book[] {
  const sorted = [...books].sort((left, right) => {
    if (key === 'category') {
      return (
        CATEGORY_SORT_ORDER.indexOf(left.category) -
        CATEGORY_SORT_ORDER.indexOf(right.category)
      );
    }
    if (key === 'publisher') {
      return compareJa(left.publisher, right.publisher);
    }
    return compareJa(titleSortKey(left), titleSortKey(right));
  });

  return order === 'desc' ? sorted.reverse() : sorted;
}

export function filterBooks(
  books: readonly Book[],
  filters: BookFilters,
): Book[] {
  return books.filter((target) => {
    if (
      filters.categories.length > 0 &&
      !filters.categories.includes(target.category)
    ) {
      return false;
    }
    if (
      filters.publishers.length > 0 &&
      !filters.publishers.includes(target.publisher)
    ) {
      return false;
    }
    if (filters.onlyOngoing && !target.is_ongoing) {
      return false;
    }
    if (filters.onlyPurchased && !target.is_purchased) {
      return false;
    }
    return true;
  });
}

/**
 * タイトル・著者・出版社を対象に部分一致で絞り込む。
 *
 * README は「タイトル、著者、関連タグ」と書いているが、本システムに
 * tags の概念はない。分類と出版社がタグに相当するため、出版社を
 * 検索対象に含めることで要件を満たす（分類は絞り込み側で扱う）。
 */
export function searchBooks(books: readonly Book[], query: string): Book[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return [...books];
  }

  return books.filter((target) => {
    const haystack =
      `${target.title} ${target.author} ${target.publisher}`.toLowerCase();
    return haystack.includes(normalized);
  });
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test -- filters`
Expected: PASS（22 テスト）

- [ ] **Step 5: 型チェックと lint を通す**

Run: `npm run typecheck && npm run lint`
Expected: どちらもエラーなし

- [ ] **Step 6: コミット**

```bash
git add src/features/bookshelf/filters.ts src/features/bookshelf/filters.test.ts
git commit -m "$(cat <<'EOF'
feat: 本棚のソート・絞り込み・検索を実装

すべてブラウザ側で処理する。README が求めるリアルタイム検索を体感ゼロで
実現でき、Supabase へのリクエストも増えないため。

title_kana は楽天が返さない書籍があるため、無ければタイトル本体で比較する。
カナが無いものを末尾へ固めると探している本が見つからなくなるため。

どの関数も入力の配列を書き換えない。React の state をそのまま渡すため、
破壊すると再描画が壊れる。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 背表紙と棚板

**Files:**
- Create: `src/features/bookshelf/BookSpine.tsx`
- Create: `src/features/bookshelf/Bookshelf.tsx`

**Interfaces:**
- Consumes: `spineStyle`（Task 1）、`Book`（`@/types/database`）
- Produces:
  - `<BookSpine book isActive onActivate onHoverStart onHoverEnd />`
  - `<Bookshelf books activeId onActivate onHoverStart onHoverEnd />`
  - `SHELF_ROW_HEIGHT_PX: number`

**設計の要点:** 段数は画面幅で変わるため棚板を手で並べられない。グリッドの背景に
行の高さと同じ周期の繰り返しグラデーションを敷き、行数へ自動追従させる。

- [ ] **Step 1: 背表紙を作る**

`src/features/bookshelf/BookSpine.tsx`:

```tsx
'use client';

import { spineStyle } from './spine';
import type { Book } from '@/types/database';

/**
 * 背表紙1冊。
 *
 * 楽天は背表紙画像を提供しないため CSS で描く。タイトルは縦書きにする。
 * 日本語書籍に自然で、幅の狭い背表紙にも収まるため。
 */
export function BookSpine({
  book,
  isActive,
  onActivate,
  onHoverStart,
  onHoverEnd,
}: {
  book: Book;
  isActive: boolean;
  onActivate: (book: Book) => void;
  onHoverStart: (book: Book) => void;
  onHoverEnd: () => void;
}) {
  const { hue, widthPx } = spineStyle(book.isbn);

  return (
    <button
      type="button"
      data-book-id={book.id}
      aria-label={`${book.title}（${book.author}）`}
      aria-pressed={isActive}
      onClick={() => onActivate(book)}
      onMouseEnter={() => onHoverStart(book)}
      onMouseLeave={onHoverEnd}
      onFocus={() => onHoverStart(book)}
      onBlur={onHoverEnd}
      style={{
        width: `${widthPx}px`,
        // 彩度と明度は固定する。木目の背景から浮きすぎないため
        backgroundColor: `hsl(${hue} 42% 38%)`,
        borderColor: `hsl(${hue} 42% 26%)`,
      }}
      className={`relative h-44 shrink-0 self-end rounded-sm border-x-2 shadow-book transition-transform duration-150 ${
        isActive ? '-translate-y-3' : 'hover:-translate-y-2'
      }`}
    >
      {/* 左右のハイライトで丸みを出す */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-sm bg-gradient-to-r from-white/25 via-transparent to-black/30"
      />
      {/* 上下の帯で装丁らしさを出す */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-2 h-1 bg-white/25"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-2 h-1 bg-white/25"
      />
      <span
        className="absolute inset-0 flex items-start justify-center overflow-hidden px-1 pt-4 text-xs leading-tight text-white"
        style={{ writingMode: 'vertical-rl', textOrientation: 'upright' }}
      >
        <span className="truncate">{book.title}</span>
      </span>
    </button>
  );
}
```

- [ ] **Step 2: 棚板とグリッドを作る**

`src/features/bookshelf/Bookshelf.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { BookSpine } from './BookSpine';
import type { Book } from '@/types/database';

/** 1段の高さ（px）。棚板の周期もこの値に合わせる */
export const SHELF_ROW_HEIGHT_PX = 200;

/**
 * 木製本棚。
 *
 * 段数は画面幅で変わるため、棚板を段数ぶん手で並べることはできない。
 * グリッドの背景に1行の高さと同じ周期の繰り返しグラデーションを敷き、
 * 棚板が行数ぶん自動的に現れるようにしている。
 */
export function Bookshelf({
  books,
  activeId,
  onActivate,
  onHoverStart,
  onHoverEnd,
}: {
  books: readonly Book[];
  activeId: string | null;
  onActivate: (book: Book) => void;
  onHoverStart: (book: Book) => void;
  onHoverEnd: () => void;
}) {
  if (books.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 rounded bg-wood-800 bg-wood-grain p-10 text-center shadow-shelf"
        style={{ minHeight: `${SHELF_ROW_HEIGHT_PX}px` }}
      >
        <p className="text-wood-100">まだ本が登録されていません。</p>
        <Link
          href="/search"
          className="rounded bg-wood-600 px-4 py-2 text-sm font-medium text-wood-50 hover:bg-wood-700"
        >
          本を探す
        </Link>
      </div>
    );
  }

  return (
    <div
      className="rounded bg-wood-800 bg-wood-grain p-2 shadow-shelf"
      style={{
        // 棚板: 各行の下端に濃い木目の帯を敷く
        backgroundImage: [
          'repeating-linear-gradient(180deg,' +
            ' transparent 0,' +
            ` transparent ${SHELF_ROW_HEIGHT_PX - 14}px,` +
            ` rgba(0,0,0,0.45) ${SHELF_ROW_HEIGHT_PX - 14}px,` +
            ` rgba(0,0,0,0.20) ${SHELF_ROW_HEIGHT_PX - 6}px,` +
            ` transparent ${SHELF_ROW_HEIGHT_PX}px)`,
        ].join(','),
      }}
    >
      <ul
        className="grid justify-items-center gap-x-1"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))',
          gridAutoRows: `${SHELF_ROW_HEIGHT_PX}px`,
        }}
      >
        {books.map((book) => (
          <li key={book.id} className="flex h-full items-end pb-4">
            <BookSpine
              book={book}
              isActive={activeId === book.id}
              onActivate={onActivate}
              onHoverStart={onHoverStart}
              onHoverEnd={onHoverEnd}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: 検証**

Run: `npm run typecheck && npm run lint && npm test`
Expected: すべてエラーなし

- [ ] **Step 4: コミット**

```bash
git add src/features/bookshelf/BookSpine.tsx src/features/bookshelf/Bookshelf.tsx
git commit -m "$(cat <<'EOF'
feat: 背表紙と棚板を実装

背表紙は CSS で描き、タイトルを縦書きにする。日本語書籍に自然で、
幅の狭い背表紙にも収まるため。

棚板は段数が画面幅で変わるため手で並べられない。グリッドの背景に
1行の高さと同じ周期の繰り返しグラデーションを敷き、行数へ自動追従させる。

書籍が0冊のときは空の棚と「本を探す」への導線を出す。棚ごと消すと
何をすればよいか分からない画面になるため。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: プレビューパネル

**Files:**
- Create: `src/features/bookshelf/BookPreview.tsx`

**Interfaces:**
- Consumes: `Book` / `BOOK_CATEGORY_LABELS`（`@/types/database`）
- Produces: `<BookPreview book onClose />`

**設計の要点:** 画面幅で配置を変える。狭い画面では画面下部のシートにする。
本の近くに出すと本棚が隠れ、スライドで隣へ移る操作の邪魔になるため。

- [ ] **Step 1: 実装を書く**

`src/features/bookshelf/BookPreview.tsx`:

```tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { BOOK_CATEGORY_LABELS, type Book } from '@/types/database';

/**
 * 表紙と概要を見せるパネル。
 *
 * 背表紙を並べる都合で表紙が見えないため、README の
 * 「概要のツールチップ」と表紙表示をここで兼ねる。
 *
 * 配置は画面幅で変える。狭い画面では画面下部のシートにする。
 * 本の近くに出すと本棚が隠れ、スライドで隣へ移る操作の邪魔になるため。
 */
export function BookPreview({
  book,
  onClose,
}: {
  book: Book;
  onClose: () => void;
}) {
  const releaseText =
    book.release_date_text ?? book.latest_release_date ?? '不明';

  return (
    <aside
      role="dialog"
      aria-label={`${book.title} の概要`}
      className="fixed inset-x-0 bottom-0 z-20 max-h-[70vh] overflow-y-auto rounded-t-lg bg-wood-50 p-4 shadow-book md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-0 md:max-h-none md:w-80 md:rounded-lg"
    >
      <div className="flex gap-3">
        {book.cover_image_url !== null && book.cover_image_url.length > 0 && (
          <Image
            src={book.cover_image_url}
            alt=""
            width={96}
            height={134}
            unoptimized
            className="h-32 w-24 flex-none object-contain"
          />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-bold text-wood-900">{book.title}</p>
          <p className="text-sm text-wood-700">{book.author}</p>
          <p className="text-sm text-wood-700">{book.publisher}</p>
          <p className="text-sm text-wood-700">発売日 {releaseText}</p>
          <p className="text-xs text-wood-600">
            {BOOK_CATEGORY_LABELS[book.category]}
            {book.is_ongoing ? '／連載中' : ''}
            {book.is_purchased ? '／購入済み' : '／未購入'}
          </p>
        </div>
      </div>

      {book.description !== null && book.description.length > 0 && (
        <p className="mt-3 line-clamp-6 text-sm text-wood-800">
          {book.description}
        </p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <Link
          href={`/books/${book.id}`}
          className="rounded bg-wood-600 px-3 py-1 text-sm font-medium text-wood-50 hover:bg-wood-700"
        >
          詳細を見る
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-wood-700 underline"
        >
          閉じる
        </button>
      </div>
    </aside>
  );
}
```

`line-clamp-6` は Tailwind 3.3 以降に標準で含まれる。使えない場合は
`overflow-hidden` と `max-h-24` で代替してよい。

- [ ] **Step 2: 検証**

Run: `npm run typecheck && npm run lint && npm test`
Expected: すべてエラーなし

- [ ] **Step 3: コミット**

```bash
git add src/features/bookshelf/BookPreview.tsx
git commit -m "$(cat <<'EOF'
feat: 表紙と概要のプレビューパネルを実装

背表紙を並べる都合で表紙が見えないため、README の「概要のツールチップ」と
表紙表示をこのパネルで兼ねる。

配置は画面幅で変える。狭い画面では画面下部のシートにする。本の近くに出すと
本棚が隠れ、スライドで隣へ移る操作の邪魔になるため。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 操作UIと全体の組み立て

**Files:**
- Create: `src/features/bookshelf/BookshelfControls.tsx`
- Create: `src/features/bookshelf/BookshelfView.tsx`
- Modify: `src/app/(app)/page.tsx`（プレースホルダを本棚へ差し替え）

**Interfaces:**
- Consumes: Task 1〜4 のすべて、`getUserBooks`（`@/features/books/cache`）、`createClient`（`@/lib/supabase/server`）
- Produces: 本棚ページ

**設計の要点:** タッチ端末はホバーがないため操作系を分ける。1回タップでプレビュー、
左右スライドで隣へ移動、プレビュー中の本を再タップで詳細へ遷移。

- [ ] **Step 1: 操作UIを作る**

`src/features/bookshelf/BookshelfControls.tsx`:

```tsx
'use client';

import {
  CATEGORY_SORT_ORDER,
  type BookFilters,
  type SortKey,
  type SortOrder,
} from './filters';
import { BOOK_CATEGORY_LABELS, type BookCategory } from '@/types/database';

const SORT_LABELS: Readonly<Record<SortKey, string>> = {
  category: '分類別',
  publisher: '出版社別',
  title: 'タイトル五十音順',
};

export function BookshelfControls({
  query,
  onQueryChange,
  sortKey,
  onSortKeyChange,
  sortOrder,
  onSortOrderChange,
  filters,
  onFiltersChange,
  publishers,
  shownCount,
  totalCount,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  sortKey: SortKey;
  onSortKeyChange: (value: SortKey) => void;
  sortOrder: SortOrder;
  onSortOrderChange: (value: SortOrder) => void;
  filters: BookFilters;
  onFiltersChange: (value: BookFilters) => void;
  publishers: readonly string[];
  shownCount: number;
  totalCount: number;
}) {
  function toggleCategory(category: BookCategory) {
    const next = filters.categories.includes(category)
      ? filters.categories.filter((item) => item !== category)
      : [...filters.categories, category];
    onFiltersChange({ ...filters, categories: next });
  }

  function togglePublisher(publisher: string) {
    const next = filters.publishers.includes(publisher)
      ? filters.publishers.filter((item) => item !== publisher)
      : [...filters.publishers, publisher];
    onFiltersChange({ ...filters, publishers: next });
  }

  return (
    <div className="space-y-3 rounded bg-wood-800 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <label htmlFor="shelf-search" className="block text-xs text-wood-200">
            検索（タイトル・著者・出版社）
          </label>
          <input
            id="shelf-search"
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            className="mt-1 w-full rounded border border-wood-300 bg-wood-50 px-3 py-2 text-wood-900"
          />
        </div>

        <div>
          <label htmlFor="shelf-sort" className="block text-xs text-wood-200">
            並び替え
          </label>
          <select
            id="shelf-sort"
            value={sortKey}
            onChange={(event) => onSortKeyChange(event.target.value as SortKey)}
            className="mt-1 rounded border border-wood-300 bg-wood-50 px-2 py-2 text-wood-900"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc')}
          aria-label={sortOrder === 'asc' ? '昇順。押すと降順' : '降順。押すと昇順'}
          className="rounded border border-wood-400 px-3 py-2 text-sm text-wood-100"
        >
          {sortOrder === 'asc' ? '昇順 ↑' : '降順 ↓'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORY_SORT_ORDER.map((category) => (
          <button
            key={category}
            type="button"
            aria-pressed={filters.categories.includes(category)}
            onClick={() => toggleCategory(category)}
            className={`rounded-full px-3 py-1 text-xs ${
              filters.categories.includes(category)
                ? 'bg-wood-500 text-wood-50'
                : 'bg-wood-700 text-wood-200'
            }`}
          >
            {BOOK_CATEGORY_LABELS[category]}
          </button>
        ))}

        {publishers.map((publisher) => (
          <button
            key={publisher}
            type="button"
            aria-pressed={filters.publishers.includes(publisher)}
            onClick={() => togglePublisher(publisher)}
            className={`rounded-full px-3 py-1 text-xs ${
              filters.publishers.includes(publisher)
                ? 'bg-wood-500 text-wood-50'
                : 'bg-wood-700 text-wood-200'
            }`}
          >
            {publisher}
          </button>
        ))}

        <button
          type="button"
          aria-pressed={filters.onlyOngoing}
          onClick={() =>
            onFiltersChange({ ...filters, onlyOngoing: !filters.onlyOngoing })
          }
          className={`rounded-full px-3 py-1 text-xs ${
            filters.onlyOngoing
              ? 'bg-wood-500 text-wood-50'
              : 'bg-wood-700 text-wood-200'
          }`}
        >
          連載中
        </button>

        <button
          type="button"
          aria-pressed={filters.onlyPurchased}
          onClick={() =>
            onFiltersChange({
              ...filters,
              onlyPurchased: !filters.onlyPurchased,
            })
          }
          className={`rounded-full px-3 py-1 text-xs ${
            filters.onlyPurchased
              ? 'bg-wood-500 text-wood-50'
              : 'bg-wood-700 text-wood-200'
          }`}
        >
          購入済み
        </button>
      </div>

      <p className="text-xs text-wood-300" role="status">
        {shownCount} / {totalCount} 冊を表示
      </p>
    </div>
  );
}
```

- [ ] **Step 2: 全体を束ねるコンポーネントを作る**

`src/features/bookshelf/BookshelfView.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, type TouchEvent } from 'react';
import { Bookshelf } from './Bookshelf';
import { BookPreview } from './BookPreview';
import { BookshelfControls } from './BookshelfControls';
import {
  EMPTY_FILTERS,
  filterBooks,
  searchBooks,
  sortBooks,
  type BookFilters,
  type SortKey,
  type SortOrder,
} from './filters';
import type { Book } from '@/types/database';

/** スライドと判定する横移動の量（px） */
const SWIPE_THRESHOLD_PX = 40;

export function BookshelfView({ books }: { books: readonly Book[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [filters, setFilters] = useState<BookFilters>(EMPTY_FILTERS);
  const [activeId, setActiveId] = useState<string | null>(null);

  const touchStartXRef = useRef<number | null>(null);

  const visibleBooks = useMemo(() => {
    const searched = searchBooks(books, query);
    const filtered = filterBooks(searched, filters);
    return sortBooks(filtered, sortKey, sortOrder);
  }, [books, query, filters, sortKey, sortOrder]);

  const publishers = useMemo(
    () => [...new Set(books.map((book) => book.publisher))].sort(),
    [books],
  );

  const activeBook =
    visibleBooks.find((book) => book.id === activeId) ?? null;

  /**
   * 本を押したときの挙動。
   *
   * マウスでは押した時点で詳細へ遷移する。ホバーで既に概要を見ているため。
   * タッチではホバーがないので、1回目はプレビュー、プレビュー中の本を
   * もう一度押したときに遷移する。判定は「その本が今プレビュー中か」で行う。
   * スライドで移った先の本にも同じ規則が適用され、操作が一貫する。
   */
  function handleActivate(book: Book) {
    const canHover =
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover)').matches;

    if (canHover || activeId === book.id) {
      router.push(`/books/${book.id}`);
      return;
    }
    setActiveId(book.id);
  }

  function handleHoverStart(book: Book) {
    const canHover =
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover)').matches;
    if (canHover) {
      setActiveId(book.id);
    }
  }

  function handleHoverEnd() {
    const canHover =
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover)').matches;
    // タッチではプレビューを開いたままにする。閉じるのは明示操作のときだけ
    if (canHover) {
      setActiveId(null);
    }
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
  }

  /** プレビュー中に左右へスライドしたら、隣の本へ移る */
  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (startX === null || activeId === null) {
      return;
    }

    const endX = event.changedTouches[0]?.clientX;
    if (endX === undefined) {
      return;
    }

    const deltaX = endX - startX;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) {
      return;
    }

    const currentIndex = visibleBooks.findIndex((book) => book.id === activeId);
    if (currentIndex < 0) {
      return;
    }

    // 左へ払うと次の本、右へ払うと前の本
    const nextIndex = deltaX < 0 ? currentIndex + 1 : currentIndex - 1;
    const nextBook = visibleBooks[nextIndex];
    if (nextBook !== undefined) {
      setActiveId(nextBook.id);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-bold text-wood-50">本棚</h1>

      <BookshelfControls
        query={query}
        onQueryChange={setQuery}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        sortOrder={sortOrder}
        onSortOrderChange={setSortOrder}
        filters={filters}
        onFiltersChange={setFilters}
        publishers={publishers}
        shownCount={visibleBooks.length}
        totalCount={books.length}
      />

      <div
        className="relative"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <Bookshelf
          books={visibleBooks}
          activeId={activeId}
          onActivate={handleActivate}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
        />

        {activeBook !== null && (
          <BookPreview book={activeBook} onClose={() => setActiveId(null)} />
        )}
      </div>

      {books.length > 0 && visibleBooks.length === 0 && (
        <p role="status" className="text-sm text-wood-200">
          条件に一致する本がありません。検索語や絞り込みを見直してください。
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 本棚ページへ差し替える**

`src/app/(app)/page.tsx` の内容を全面的に置き換える:

```tsx
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getUserBooks } from '@/features/books/cache';
import { BookshelfView } from '@/features/bookshelf/BookshelfView';

export const metadata: Metadata = { title: '本棚 | Bookshelf' };

export const dynamic = 'force-dynamic';

export default async function BookshelfPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // userId は必ず認証済みセッションから取得する。
  // getUserBooks は RLS を迂回する管理者クライアントを使うため
  // （工程Dの設計書 8.1 規則1）
  const books = user === null ? [] : await getUserBooks(user.id);

  return <BookshelfView books={books} />;
}
```

- [ ] **Step 4: 検証**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: すべてエラーなし

**build の前に開発サーバーを止めること。** 止めずに実行すると `.next` が壊れ、
CSS が当たらない画面になる。

- [ ] **Step 5: コミット**

```bash
git add src/features/bookshelf/BookshelfControls.tsx src/features/bookshelf/BookshelfView.tsx "src/app/(app)/page.tsx"
git commit -m "$(cat <<'EOF'
feat: 本棚ページを実装

ソート・絞り込み・検索をブラウザ側で行い、本棚のプレースホルダページを
差し替える。

タッチ端末はホバーがないため操作系を分ける。マウスは押した時点で詳細へ
遷移する（ホバーで既に概要を見ているため）。タッチは1回目でプレビュー、
プレビュー中の本を再度押すと遷移する。判定は「その本が今プレビュー中か」で
行うため、スライドで移った先の本にも同じ規則が適用され操作が一貫する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 書籍詳細ページ

**Files:**
- Create: `src/app/(app)/books/[id]/page.tsx`

**Interfaces:**
- Consumes: `getUserBooks`、`createClient`、`BOOK_CATEGORY_LABELS`
- Produces: ルート `/books/[id]`

**設計の要点:** 他人の書籍 ID を指定しても「存在しない」と区別しない。
区別すると ID の総当たりで他人の蔵書の存在を推測できるため。

- [ ] **Step 1: 実装を書く**

`src/app/(app)/books/[id]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserBooks } from '@/features/books/cache';
import { BOOK_CATEGORY_LABELS } from '@/types/database';

export const metadata: Metadata = { title: '書籍の詳細 | Bookshelf' };

export const dynamic = 'force-dynamic';

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    notFound();
  }

  // 1冊のために別クエリを投げず、キャッシュ済みの一覧から引く。
  // 他人の書籍はそもそも一覧に含まれないため、ここで弾かれる。
  const books = await getUserBooks(user.id);
  const book = books.find((item) => item.id === id);

  // 他人の書籍と存在しない書籍を区別しない。
  // 区別すると ID の総当たりで他人の蔵書の存在を推測できるため
  if (book === undefined) {
    notFound();
  }

  const releaseText =
    book.release_date_text ?? book.latest_release_date ?? '不明';

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/" className="text-sm text-wood-200 underline">
        ← 本棚へ戻る
      </Link>

      <div className="flex flex-col gap-4 rounded bg-wood-800 p-4 shadow-book sm:flex-row">
        {book.cover_image_url !== null && book.cover_image_url.length > 0 && (
          <Image
            src={book.cover_image_url}
            alt=""
            width={160}
            height={224}
            unoptimized
            className="h-56 w-40 flex-none self-start object-contain"
          />
        )}

        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="text-xl font-bold text-wood-50">{book.title}</h1>
          <dl className="space-y-1 text-sm text-wood-200">
            <div className="flex gap-2">
              <dt className="w-20 flex-none text-wood-300">著者</dt>
              <dd>{book.author}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 flex-none text-wood-300">出版社</dt>
              <dd>{book.publisher}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 flex-none text-wood-300">分類</dt>
              <dd>{BOOK_CATEGORY_LABELS[book.category]}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 flex-none text-wood-300">連載</dt>
              <dd>{book.is_ongoing ? '連載中' : '完結・単発'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 flex-none text-wood-300">購入</dt>
              <dd>{book.is_purchased ? '購入済み' : '未購入'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 flex-none text-wood-300">発売日</dt>
              <dd>{releaseText}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 flex-none text-wood-300">ISBN</dt>
              <dd>{book.isbn}</dd>
            </div>
          </dl>

          {book.item_url !== null && book.item_url.length > 0 && (
            <a
              href={book.item_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm text-wood-100 underline"
            >
              楽天ブックスで見る
            </a>
          )}
        </div>
      </div>

      {book.description !== null && book.description.length > 0 && (
        <section className="rounded bg-wood-800 p-4">
          <h2 className="mb-2 text-sm font-bold text-wood-100">あらすじ</h2>
          <p className="whitespace-pre-wrap text-sm text-wood-200">
            {book.description}
          </p>
        </section>
      )}
    </div>
  );
}
```

`whitespace-pre-wrap` で改行を保つが、`dangerouslySetInnerHTML` は使わない。
楽天由来の文字列を HTML として解釈させないため。

- [ ] **Step 2: 検証**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: すべてエラーなし。ビルドのルート一覧に `/books/[id]` が現れる

- [ ] **Step 3: コミット**

```bash
git add "src/app/(app)/books"
git commit -m "$(cat <<'EOF'
feat: 書籍詳細ページを追加

キャッシュ済みの本棚一覧から該当IDを引く。1冊のために別クエリを投げるより
通信が減るため。他人の書籍はそもそも一覧に含まれないため、ここで弾かれる。

他人の書籍と存在しない書籍を区別せず、どちらも notFound とする。
区別すると ID の総当たりで他人の蔵書の存在を推測できるため。

あらすじは whitespace-pre-wrap で改行を保つが、dangerouslySetInnerHTML は
使わない。楽天由来の文字列を HTML として解釈させないため。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 受け入れ確認と PR 作成

**Files:** 変更なし（検証のみ）

**Interfaces:**
- Consumes: Task 1〜6 のすべて
- Produces: PR

**前提:** 本棚に書籍が登録されていること。現在12冊あるが、すべて同じ分類
（コミック）・同じ出版社（講談社）・すべて連載中のため、分類別ソート・
出版社別ソート・分類での絞り込み・連載中での絞り込みは**変化を確認できない**。
人間へ別分類の書籍の追加を依頼すること。

- [ ] **Step 1: 自動検証**

開発サーバーを止めたうえで実行する。

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: すべてエラー・警告なし。ルート一覧に `/` と `/books/[id]` が現れる

- [ ] **Step 2: 実ブラウザで確認**

`npm run dev` を起動し、設計書12章の受け入れ基準を確認する。

| # | 手順 | 期待結果 |
| --- | --- | --- |
| 1 | `/` を開く | 背表紙が棚に並ぶ |
| 2 | 再読み込みする | 各本の背表紙の色が変わらない |
| 3 | ウィンドウ幅を狭める | 1段の冊数が減る。横スクロールが出ない |
| 4 | 背表紙にホバーする | 本がせり出し、表紙と概要のパネルが出る |
| 5 | 背表紙をクリックする | `/books/[id]` へ遷移する |
| 6 | Tab キーで移動する | 本にフォーカスが移り、パネルが出る |
| 7 | Enter を押す | 詳細ページへ遷移する |
| 8 | 並び替えを切り替える | 並び順が変わる |
| 9 | 昇順・降順を切り替える | 並びが逆になる |
| 10 | 絞り込みタグを押す | 該当する本だけが残る。表示件数が更新される |
| 11 | 検索窓へ入力する | 通信なしで即座に絞り込まれる |
| 12 | 一致しない語を入力する | 「条件に一致する本がありません」と出る |
| 13 | 存在しない ID を `/books/` に指定する | 404 になる |

- [ ] **Step 3: タッチ操作を確認**

開発者ツールのデバイスエミュレーションでスマートフォン表示に切り替え、
**ページを再読み込みしてから**確認する（`hover` の判定が読み込み時に効くため）。

| # | 手順 | 期待結果 |
| --- | --- | --- |
| 14 | 本を1回タップする | プレビューが画面下部のシートとして出る |
| 15 | 左右へスライドする | 隣の本へプレビューが移る |
| 16 | プレビュー中の本をタップする | 詳細ページへ遷移する |
| 17 | 「閉じる」を押す | プレビューが閉じる |

- [ ] **Step 4: DB で他人の書籍IDを確認する**

Supabase MCP の `execute_sql` で一般ユーザー（ようざん０２）の書籍 ID を取得し、
管理者でログインした状態で `/books/<その ID>` を開き、404 になることを確認する。
一般ユーザーが書籍を持っていない場合は、存在しない UUID で代用してよい。

- [ ] **Step 5: プッシュして PR を作成**

```bash
git push -u origin feature/bookshelf-ui
gh pr create --base main --title "feat: 木製本棚UIと書籍詳細ページを実装" --body "$(cat <<'EOF'
README の機能要件B（木製本棚UI）を実装する。

## 実装内容

- 木製本棚UI（CSS生成の背表紙、棚板、レスポンシブ）
- プレビュー（表紙＋概要）。マウスとタッチで操作系を分離
- ソート（分類別 / 出版社別 / 五十音順、昇順降順）
- 絞り込み（分類・出版社・連載中・購入済み）
- リアルタイム検索（タイトル・著者・出版社）
- 書籍詳細ページ /books/[id]

## 設計上の判断

背表紙の色と厚みは ISBN から決定的に算出する。ランダムだと再読み込みで
変わり「あの赤い本」という見た目の記憶が使えなくなるため。分類ごとの色だと
同じ分類が全部同色になり見分けがつかないため。

タッチ端末はホバーがないため操作系を分けた。1回タップでプレビュー、
左右スライドで隣へ移動、プレビュー中の本を再タップで詳細へ遷移する。
長押しは OS の文脈メニューと競合するため採らない。

title_kana は楽天が返さない書籍があるため、タイトル本体での比較へ
フォールバックする。カナ無しを末尾へ固めると探している本が見つからなくなる。

他人の書籍IDは notFound とし「存在しない」と区別しない。区別すると
IDの総当たりで他人の蔵書の存在を推測できるため。

## 検証

- typecheck / lint / test / build すべてエラーなし
- 実ブラウザでマウス操作・キーボード操作・タッチ操作を確認済み

## ドキュメント

- 設計書: docs/superpowers/specs/2026-09-18-bookshelf-ui-design.md
- 実装計画: docs/superpowers/plans/2026-09-18-bookshelf-ui.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: 音声案内を鳴らして人間へ承認を求める**

```bash
say -v Kyoko -r 200 "本棚UIの実装が完了しました。プルリクエストの承認をお願いします。"
```

マージは人間の承認を得てから行う（CLAUDE.md 3章）。
