# 楽天ブックスAPI連携 & キャッシュ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 楽天ブックスAPIで書籍を検索し、分類と発売日を補正したうえで本棚へ保存できるようにする。併せてサーバーキャッシュを構築する。

**Architecture:** 楽天APIはサーバー側からのみ呼ぶ。表記揺れの解析と分類推定は純粋関数へ切り出して TDD で固める。キャッシュは `unstable_cache` と `revalidateTag` を使い、本棚一覧は `userId` をキーに含める。

**Tech Stack:** Next.js 15.5 / React 19 / TypeScript strict / Tailwind CSS 3 / @supabase/ssr 0.12 / Vitest

**Spec:** `docs/superpowers/specs/2026-09-10-rakuten-api-design.md`

## Global Constraints

- 対話・ドキュメント・コメント・コミットメッセージはすべて日本語。コード内の識別子は英語
- TypeScript strict モード。`any` の使用は禁止（`@typescript-eslint/no-explicit-any: error`）
- `tsconfig.json` は `noUncheckedIndexedAccess` / `noUnusedLocals` / `noUnusedParameters` が有効。配列アクセスの結果は `T | undefined` になる
- **`'use server'` ファイルは async 関数以外を export できない。** 定数は別ファイル（`state.ts` 等）へ置く。破ると静的プリレンダリングが `TypeError` で落ちる
- `RAKUTEN_APP_ID` はサーバー側でのみ参照する。ブラウザへ渡さない。画面にも例外メッセージにも値を出さない
- `console.error(error)` のようにエラーオブジェクトをそのまま出力しない。日本語文言へ変換した文字列のみ扱う
- 楽天APIのレスポンスは外部由来データとして扱う。`dangerouslySetInnerHTML` を使わない
- パス別名 `@/*` は `./src/*` を指す
- コミット前に `npm run typecheck` / `npm run lint` / `npm test` / `npm run build` がすべてエラーなしであること
- **開発サーバーの稼働中に `npm run build` を実行しないこと。** `.next` が壊れ、CSS が当たらなくなる
- `npm install` を実行しないこと（`@vitejs/plugin-react` が 5.2.0 に固定されており壊れる）
- コミットメッセージ末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- 作業ブランチは `feature/rakuten-api`。`main` へのマージは人間の承認を得てから

## 既存コードの前提

```ts
// src/lib/env.ts
export function getServerEnv(): { supabaseServiceRoleKey: string; rakutenAppId: string; rakutenAffiliateId: string | undefined };
// ↑ 未設定だと例外を投げる。未設定判定にはこれを使わないこと

// src/lib/supabase/server.ts
export async function createClient(): Promise<SupabaseClient<Database>>;  // RLS 適用・要 await
export function createAdminClient(): SupabaseClient<Database>;            // RLS 迂回

// src/types/database.ts
export type BookCategory = 'tankobon' | 'series_tankobon' | 'light_novel' | 'comic';
export const ONGOING_CAPABLE_CATEGORIES: readonly BookCategory[];
export const BOOK_CATEGORY_LABELS: Readonly<Record<BookCategory, string>>;
export type Book = { id: string; user_id: string; isbn: string; title: string; title_kana: string | null; author: string; publisher: string; category: BookCategory; is_ongoing: boolean; cover_image_url: string | null; description: string | null; is_purchased: boolean; purchased_at: string | null; latest_release_date: string | null; item_url: string | null; created_at: string; updated_at: string };

// src/features/auth/profile.ts
export async function getCurrentUserRole(): Promise<UserRole>;

// src/lib/speech.ts
export function speakComplete(message?: string): boolean;
export function speakError(message?: string): boolean;
```

DB 制約: `books` は `UNIQUE(user_id, isbn)`。`is_ongoing = true` は `category in ('series_tankobon','light_novel','comic')` のときのみ許される。`is_purchased = false` のとき `purchased_at` は `null` でなければならない。

## ファイル構成

| ファイル | 責務 |
| --- | --- |
| `src/features/rakuten/types.ts` | 楽天APIレスポンスの型と検索結果の型 |
| `src/features/rakuten/parse.ts` | 発売日解析・分類推定（純粋関数） |
| `src/features/rakuten/client.ts` | 楽天APIの呼び出し（server-only） |
| `src/features/rakuten/cache.ts` | 検索結果のキャッシュ |
| `src/features/rakuten/SearchForm.tsx` | 検索フォーム |
| `src/features/rakuten/SearchResults.tsx` | 検索結果一覧 |
| `src/features/rakuten/SaveBookForm.tsx` | 保存フォーム（分類・連載中の修正） |
| `src/features/books/keys.ts` | キャッシュキーとタグの生成（純粋関数） |
| `src/features/books/cache.ts` | 本棚一覧の取得（キャッシュ付き） |
| `src/features/books/actions.ts` | 本棚への保存（Server Action） |
| `src/features/books/state.ts` | フォーム初期状態の定数 |
| `src/app/(app)/search/page.tsx` | 検索画面 |
| `supabase/migrations/0006_add_release_date_text.sql` | `release_date_text` の追加 |

---

### Task 1: 発売日解析と分類推定

**Files:**
- Create: `src/features/rakuten/parse.ts`
- Test: `src/features/rakuten/parse.test.ts`

**Interfaces:**
- Consumes: `BookCategory` / `ONGOING_CAPABLE_CATEGORIES`（`@/types/database`）
- Produces:
  - `interface ParsedSalesDate { date: string | null; text: string }`
  - `parseSalesDate(salesDate: string): ParsedSalesDate`
  - `estimateCategory(input: { size: string; booksGenreId: string; seriesName: string }): BookCategory`
  - `isOngoingByDefault(seriesName: string, category: BookCategory): boolean`
  - `LIGHT_NOVEL_GENRE_PREFIXES: readonly string[]`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/rakuten/parse.test.ts`:

```ts
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
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test -- parse`
Expected: FAIL — `Failed to resolve import "./parse"`

- [ ] **Step 3: 実装を書く**

`src/features/rakuten/parse.ts`:

```ts
/**
 * 楽天ブックスAPIのレスポンスを本システムの形へ解釈する純粋関数群。
 * 通信を含まないため、テストで挙動を固定できる。
 */

import {
  ONGOING_CAPABLE_CATEGORIES,
  type BookCategory,
} from '@/types/database';

/**
 * ライトノベルと判定する booksGenreId の接頭辞。
 *
 * ⚠️ 実APIのレスポンスで未検証の暫定値。RAKUTEN_APP_ID を設定したあと
 * 実際のジャンルIDを確認して確定させること。判定を外しても保存画面で
 * 手動修正できるため、機能全体は成立する。
 * 値をここへ集約しているのは、確定時に1箇所だけ直せばよくするため。
 */
export const LIGHT_NOVEL_GENRE_PREFIXES: readonly string[] = ['001017'];

export interface ParsedSalesDate {
  /** YYYY-MM-DD。確定日を特定できたときのみ値が入る */
  date: string | null;
  /** 受け取った原文（前後の空白のみ除去） */
  text: string;
}

/** 実在する日付かを確認する。2026年02月30日 のような値を弾く */
function isRealDate(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * salesDate を解析する。
 *
 * 「2026年秋」「2026年09月頃」のような確定できない表記を、その月の1日などと
 * 解釈してはならない。カレンダーに実在しない予定を作ってしまうため。
 * 確定日でなければ date は null とし、表示には text を使う。
 */
export function parseSalesDate(salesDate: string): ParsedSalesDate {
  const text = salesDate.trim();
  if (text.length === 0) {
    return { date: null, text: '' };
  }

  const matched = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(text);
  if (matched === null) {
    return { date: null, text };
  }

  const [, rawYear, rawMonth, rawDay] = matched;
  if (
    rawYear === undefined ||
    rawMonth === undefined ||
    rawDay === undefined
  ) {
    return { date: null, text };
  }

  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);

  if (!isRealDate(year, month, day)) {
    return { date: null, text };
  }

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return { date: `${year}-${mm}-${dd}`, text };
}

/**
 * 4分類を推定する。上から順に評価し、最初に一致したものを採用する。
 * 楽天APIはこの4分類をそのまま返さないため推定が必要。
 */
export function estimateCategory(input: {
  size: string;
  booksGenreId: string;
  seriesName: string;
}): BookCategory {
  if (input.size.includes('コミック')) {
    return 'comic';
  }
  if (
    LIGHT_NOVEL_GENRE_PREFIXES.some((prefix) =>
      input.booksGenreId.startsWith(prefix),
    )
  ) {
    return 'light_novel';
  }
  if (input.seriesName.trim().length > 0) {
    return 'series_tankobon';
  }
  return 'tankobon';
}

/**
 * 連載中フラグの既定値。
 * 単行本は DB の check 制約により true を持てないため常に false を返す。
 */
export function isOngoingByDefault(
  seriesName: string,
  category: BookCategory,
): boolean {
  if (!ONGOING_CAPABLE_CATEGORIES.includes(category)) {
    return false;
  }
  return seriesName.trim().length > 0;
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test -- parse`
Expected: PASS（17 テスト）

- [ ] **Step 5: 型チェックと lint を通す**

Run: `npm run typecheck && npm run lint`
Expected: どちらもエラーなし

- [ ] **Step 6: コミット**

```bash
git add src/features/rakuten/parse.ts src/features/rakuten/parse.test.ts
git commit -m "$(cat <<'EOF'
feat: 楽天APIレスポンスの解析ロジックを実装

発売日の表記揺れ（「2026年秋」等）を確定日と原文へ分離する。曖昧な表記を
その月の1日などと解釈すると、カレンダーに実在しない予定を作ってしまうため、
確定日でなければ date は null とし表示には原文を使う。

分類は size / booksGenreId / seriesName から推定する。ライトノベルの
ジャンルIDは実APIで未検証のため、定数として1箇所へ集約した。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 発売日原文カラムの追加

**Files:**
- Create: `supabase/migrations/0006_add_release_date_text.sql`
- Modify: `src/types/database.ts`（`Book` 型に `release_date_text` を追加）

**Interfaces:**
- Consumes: なし
- Produces: `Book['release_date_text']: string | null`

**DB へ適用しないこと:** リモートDBへの書き込みは環境の制限で実行できない。SQL ファイルの作成とコミットのみを行う。適用は人間が別途実施する。

- [ ] **Step 1: マイグレーションを作成**

`supabase/migrations/0006_add_release_date_text.sql`:

```sql
-- =============================================================================
-- 発売日の原文を保持するカラムを追加する
--
-- 楽天APIの salesDate は「2026年09月10日」のような確定日だけでなく、
-- 「2026年秋」「2026年09月頃」のような確定できない表記も返す。
-- latest_release_date は date 型のため後者を保持できないが、捨てると
-- 「2026年秋発売」という情報を画面に出せなくなる。
--
-- 曖昧な表記をその月の1日などと解釈してカレンダーへ入れることはしない。
-- 実在しない予定を作ってしまうため。確定日のみ latest_release_date に入れ、
-- 原文は本カラムへ保持して表示に使う。
-- =============================================================================

alter table public.books
  add column if not exists release_date_text text;

comment on column public.books.release_date_text is
  '楽天APIの salesDate 原文。「2026年秋」のような確定できない表記を保持する';
```

- [ ] **Step 2: 型定義を更新**

`src/types/database.ts` の `Book` 型で `latest_release_date` の直後へ追加する:

```ts
  release_date_text: string | null;
```

同ファイル内の `Tables` セクションに `books` の `Row` / `Insert` / `Update` 相当の記述があれば、そちらにも同じ要領で追加する。無ければ `Book` 型のみでよい。

- [ ] **Step 3: 型チェックを通す**

Run: `npm run typecheck && npm run lint && npm test`
Expected: すべてエラーなし

- [ ] **Step 4: コミット**

```bash
git add supabase/migrations/0006_add_release_date_text.sql src/types/database.ts
git commit -m "$(cat <<'EOF'
feat: 発売日の原文を保持するカラムを追加

楽天APIの salesDate は「2026年秋」のような確定できない表記を返す。
latest_release_date は date 型のため保持できず、捨てると情報が失われる。
確定日は latest_release_date、原文は release_date_text という使い分けとする。

DBへの適用は未実施（別途手動で実施する）。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 楽天APIクライアント

**Files:**
- Create: `src/features/rakuten/types.ts`
- Create: `src/features/rakuten/client.ts`

**Interfaces:**
- Consumes: `getServerEnv()`（`@/lib/env`）
- Produces:
  - `interface RakutenBookItem { isbn; title; titleKana; author; publisherName; size; booksGenreId; seriesName; salesDate; itemCaption; largeImageUrl; itemUrl }`（すべて `string`）
  - `type RakutenSearchResult = { ok: true; items: RakutenBookItem[]; count: number; page: number; pageCount: number } | { ok: false; reason: 'not_configured' | 'request_failed' }`
  - `isRakutenConfigured(): boolean`
  - `searchBooksOrThrow(params: { keyword: string; page: number }): Promise<{ items: RakutenBookItem[]; count: number; page: number; pageCount: number }>`

**設計の要点:** `searchBooksOrThrow` は失敗時に例外を投げる。Task 4 でこれを `unstable_cache` に包むが、例外が出たキャッシュエントリは保存されないため、**失敗結果がキャッシュに焼き付くことを防げる**。呼び出し側で捕捉して union へ変換する。

- [ ] **Step 1: 型を定義**

`src/features/rakuten/types.ts`:

```ts
/** 楽天ブックス書籍検索APIから受け取る項目のうち、本システムが使うもの */
export interface RakutenBookItem {
  isbn: string;
  title: string;
  titleKana: string;
  author: string;
  publisherName: string;
  size: string;
  booksGenreId: string;
  seriesName: string;
  salesDate: string;
  itemCaption: string;
  largeImageUrl: string;
  itemUrl: string;
}

export interface RakutenSearchSuccess {
  items: RakutenBookItem[];
  count: number;
  page: number;
  pageCount: number;
}

/**
 * 検索結果。失敗を例外ではなく値で表し、画面側で分岐できるようにする。
 * reason には理由の区分のみを入れ、APP_ID や生のエラー内容は含めない。
 */
export type RakutenSearchResult =
  | ({ ok: true } & RakutenSearchSuccess)
  | { ok: false; reason: 'not_configured' | 'request_failed' };
```

- [ ] **Step 2: クライアントを実装**

`src/features/rakuten/client.ts`:

```ts
import 'server-only';

import type { RakutenBookItem, RakutenSearchSuccess } from './types';

const ENDPOINT =
  'https://app.rakuten.co.jp/services/api/BooksBook/Search/20170404';

/** 1ページあたりの取得件数。楽天APIの上限は 30 */
const HITS_PER_PAGE = 30;

/**
 * 楽天ウェブサービスのアプリIDが設定されているか。
 *
 * getServerEnv() は未設定だと例外を投げるため、未設定判定には使えない。
 * ここでは値そのものを返さず、設定の有無だけを返す。
 */
export function isRakutenConfigured(): boolean {
  const appId = process.env.RAKUTEN_APP_ID;
  return typeof appId === 'string' && appId.trim().length > 0;
}

/** レスポンスの値を安全に文字列へ寄せる。欠けている項目は空文字にする */
function asString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return '';
}

function toBookItem(raw: Record<string, unknown>): RakutenBookItem {
  return {
    isbn: asString(raw.isbn),
    title: asString(raw.title),
    titleKana: asString(raw.titleKana),
    author: asString(raw.author),
    publisherName: asString(raw.publisherName),
    size: asString(raw.size),
    booksGenreId: asString(raw.booksGenreId),
    seriesName: asString(raw.seriesName),
    salesDate: asString(raw.salesDate),
    itemCaption: asString(raw.itemCaption),
    largeImageUrl: asString(raw.largeImageUrl),
    itemUrl: asString(raw.itemUrl),
  };
}

/**
 * 楽天ブックス書籍検索APIを1回だけ呼ぶ。
 *
 * 失敗時は例外を投げる。呼び出し側（cache.ts）はこれを捕捉して
 * 結果の union へ変換する。例外にしているのは、unstable_cache が
 * 例外時にキャッシュを保存しないため、失敗が焼き付くのを防げるから。
 *
 * APP_ID をログ・エラーメッセージへ含めてはならない。
 */
export async function searchBooksOrThrow(params: {
  keyword: string;
  page: number;
}): Promise<RakutenSearchSuccess> {
  const appId = process.env.RAKUTEN_APP_ID ?? '';
  if (appId.length === 0) {
    throw new Error('RAKUTEN_APP_ID_NOT_CONFIGURED');
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set('applicationId', appId);
  url.searchParams.set('formatVersion', '2');
  url.searchParams.set('keyword', params.keyword);
  url.searchParams.set('hits', String(HITS_PER_PAGE));
  url.searchParams.set('page', String(params.page));

  const response = await fetch(url, {
    // キャッシュは unstable_cache 側で制御するため fetch 自体はキャッシュしない
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    // ステータスコードのみを扱い、本文やURLは出力しない（APP_ID を含むため）
    throw new Error(`RAKUTEN_REQUEST_FAILED_${response.status}`);
  }

  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null) {
    throw new Error('RAKUTEN_UNEXPECTED_BODY');
  }

  const record = body as Record<string, unknown>;
  const rawItems = Array.isArray(record.Items) ? record.Items : [];

  const items = rawItems
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null,
    )
    .map(toBookItem)
    // ISBN のない商品は本棚へ保存できないため除外する
    .filter((item) => item.isbn.length > 0);

  return {
    items,
    count: typeof record.count === 'number' ? record.count : items.length,
    page: typeof record.page === 'number' ? record.page : params.page,
    pageCount: typeof record.pageCount === 'number' ? record.pageCount : 1,
  };
}
```

- [ ] **Step 3: 型チェックと lint を通す**

Run: `npm run typecheck && npm run lint && npm test`
Expected: すべてエラーなし

- [ ] **Step 4: コミット**

```bash
git add src/features/rakuten/types.ts src/features/rakuten/client.ts
git commit -m "$(cat <<'EOF'
feat: 楽天ブックスAPIクライアントを実装

APP_ID はサーバー側でのみ参照し、ログ・エラーメッセージ・URL のいずれにも
出さない。失敗は例外で表し、呼び出し側で結果の union へ変換する。
例外にしているのは unstable_cache が例外時にキャッシュを保存しないため、
失敗結果が焼き付くのを防げるから。

未設定判定には getServerEnv() ではなく isRakutenConfigured() を使う。
前者は例外を投げるため、案内文言を出す用途に使えない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: キャッシュ層

**Files:**
- Create: `src/features/books/keys.ts`
- Test: `src/features/books/keys.test.ts`
- Create: `src/features/books/cache.ts`
- Create: `src/features/rakuten/cache.ts`

**Interfaces:**
- Consumes: `searchBooksOrThrow` / `isRakutenConfigured`（Task 3）、`RakutenSearchResult`（Task 3）、`createAdminClient`（`@/lib/supabase/server`）、`Book`（`@/types/database`）
- Produces:
  - `userBooksCacheKey(userId: string): string[]`
  - `userBooksCacheTag(userId: string): string`
  - `getUserBooks(userId: string): Promise<Book[]>`
  - `getCachedRakutenSearch(keyword: string, page: number): Promise<RakutenSearchResult>`

**★このタスクが本機能で最も危険な箇所★**

`unstable_cache` の内部では `cookies()` を読めないため、本棚一覧は RLS を迂回する
`createAdminClient()` を使う。**RLS の保護が外れ、`userId` の正しさだけが唯一の防壁になる。**
設計書 8.1 章の4規則を厳守すること。

- [ ] **Step 1: 失敗するテストを書く**

`src/features/books/keys.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { userBooksCacheKey, userBooksCacheTag } from './keys';

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';

describe('userBooksCacheKey', () => {
  it('キーに userId を必ず含める', () => {
    expect(userBooksCacheKey(USER_A)).toContain(USER_A);
  });

  it('利用者ごとに異なるキーになる', () => {
    expect(userBooksCacheKey(USER_A)).not.toEqual(userBooksCacheKey(USER_B));
  });

  it('同じ利用者なら同じキーになる', () => {
    expect(userBooksCacheKey(USER_A)).toEqual(userBooksCacheKey(USER_A));
  });

  it('用途を示す接頭辞を持つ', () => {
    expect(userBooksCacheKey(USER_A)[0]).toBe('user-books');
  });
});

describe('userBooksCacheTag', () => {
  it('タグに userId を必ず含める', () => {
    expect(userBooksCacheTag(USER_A)).toContain(USER_A);
  });

  it('利用者ごとに異なるタグになる', () => {
    expect(userBooksCacheTag(USER_A)).not.toBe(userBooksCacheTag(USER_B));
  });

  it('同じ利用者なら同じタグになる', () => {
    expect(userBooksCacheTag(USER_A)).toBe(userBooksCacheTag(USER_A));
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test -- keys`
Expected: FAIL — `Failed to resolve import "./keys"`

- [ ] **Step 3: キー生成を実装**

`src/features/books/keys.ts`:

```ts
/**
 * 本棚キャッシュのキーとタグを生成する純粋関数。
 *
 * 文字列を各所で直接組み立てると、userId をキーへ含め忘れても気づけない。
 * 含め忘れると利用者間でキャッシュが共有され、他人の本棚が見えてしまう。
 * そのため生成はここへ集約し、テストで固定する（設計書 8.1 の規則2）。
 */

export function userBooksCacheKey(userId: string): string[] {
  return ['user-books', userId];
}

export function userBooksCacheTag(userId: string): string {
  return `books:${userId}`;
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test -- keys`
Expected: PASS（7 テスト）

- [ ] **Step 5: 本棚一覧のキャッシュを実装**

`src/features/books/cache.ts`:

```ts
import 'server-only';

import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import type { Book } from '@/types/database';
import { userBooksCacheKey, userBooksCacheTag } from './keys';

/**
 * 利用者の本棚を取得する。結果はキャッシュされ、保存・更新・削除の
 * Server Action が revalidateTag(userBooksCacheTag(userId)) で無効化する。
 *
 * ★安全上きわめて重要★
 * unstable_cache の内部では cookies() を読めないため、セッションを引き継ぐ
 * 通常のクライアントを使えず、RLS を迂回する管理者クライアントを使っている。
 * つまり RLS の保護が外れており、userId の正しさだけが唯一の防壁である。
 *
 * 呼び出し側は、必ず supabase.auth.getUser() から得た userId を渡すこと。
 * リクエストパラメータや props から受け取った値を渡してはならない。
 * （設計書 8.1 の規則1）
 */
export async function getUserBooks(userId: string): Promise<Book[]> {
  if (userId.length === 0) {
    return [];
  }

  const load = unstable_cache(
    async (): Promise<Book[]> => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('books')
        .select('*')
        // 管理者クライアントは RLS が効かないため、絞り込みを必ず書く
        // （設計書 8.1 の規則3）。これを落とすと全利用者の本が返る
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error !== null || data === null) {
        // エラーオブジェクトは出力しない
        return [];
      }
      return data;
    },
    userBooksCacheKey(userId),
    { tags: [userBooksCacheTag(userId)] },
  );

  return load();
}
```

**注意:** `.select()` を必ず `.eq()` より先に呼ぶこと。supabase-js では `from()` の
戻り値に `.eq()` が存在せず、順序を逆にすると型エラーになる。
そして **`.eq('user_id', userId)` を絶対に落とさないこと**。落とすと全利用者の本が
返り、キャッシュ経由で他人の本棚が漏れる。

- [ ] **Step 6: 楽天検索のキャッシュを実装**

`src/features/rakuten/cache.ts`:

```ts
import 'server-only';

import { unstable_cache } from 'next/cache';
import { isRakutenConfigured, searchBooksOrThrow } from './client';
import type { RakutenSearchResult } from './types';

/** 検索結果を保持する秒数。楽天への呼び出しを抑える */
const SEARCH_REVALIDATE_SECONDS = 3600;

/**
 * 楽天ブックスの検索結果をキャッシュ付きで取得する。
 *
 * 失敗結果をキャッシュしないよう、キャッシュの内側では例外を投げる関数を
 * そのまま呼び、外側で捕捉して union へ変換している。unstable_cache は
 * 例外時にエントリを保存しないため、一時的な失敗が1時間焼き付くことを防げる。
 */
export async function getCachedRakutenSearch(
  keyword: string,
  page: number,
): Promise<RakutenSearchResult> {
  const trimmed = keyword.trim();
  if (trimmed.length === 0) {
    return { ok: true, items: [], count: 0, page, pageCount: 0 };
  }
  if (!isRakutenConfigured()) {
    return { ok: false, reason: 'not_configured' };
  }

  const load = unstable_cache(
    async () => searchBooksOrThrow({ keyword: trimmed, page }),
    ['rakuten-search', trimmed, String(page)],
    { revalidate: SEARCH_REVALIDATE_SECONDS, tags: ['rakuten-search'] },
  );

  try {
    const result = await load();
    return { ok: true, ...result };
  } catch {
    // エラーオブジェクトは出力しない。APP_ID を含みうるため
    return { ok: false, reason: 'request_failed' };
  }
}
```

- [ ] **Step 7: 検証**

Run: `npm run typecheck && npm run lint && npm test`
Expected: すべてエラーなし。テストは 7 件増える

- [ ] **Step 8: コミット**

```bash
git add src/features/books/keys.ts src/features/books/keys.test.ts src/features/books/cache.ts src/features/rakuten/cache.ts
git commit -m "$(cat <<'EOF'
feat: 本棚と楽天検索のサーバーキャッシュを実装

unstable_cache の内部では cookies() を読めないため、本棚一覧は RLS を
迂回する管理者クライアントを使う。RLS の保護が外れ userId の正しさだけが
唯一の防壁になるため、キーとタグの生成を純粋関数へ集約してテストで固定し、
クエリの user_id 絞り込みとあわせて多重に守る。

楽天検索は失敗結果がキャッシュへ焼き付かないよう、キャッシュの内側では
例外を投げ、外側で捕捉して結果の union へ変換する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 本棚への保存 Server Action

**Files:**
- Create: `src/features/books/state.ts`
- Create: `src/features/books/actions.ts`

**Interfaces:**
- Consumes: `createClient`（`@/lib/supabase/server`）、`userBooksCacheTag`（Task 4）、`BookCategory` / `ONGOING_CAPABLE_CATEGORIES`（`@/types/database`）
- Produces:
  - `interface SaveBookState { errorMessage: string; successMessage: string }`（`actions.ts` に定義）
  - `SAVE_BOOK_INITIAL_STATE: SaveBookState`（`state.ts` に定義）
  - `saveBookAction(prevState: SaveBookState, formData: FormData): Promise<SaveBookState>`

**⚠️ `'use server'` の制約:** `actions.ts` からは async 関数のみを export する。定数
`SAVE_BOOK_INITIAL_STATE` は `state.ts` へ置く。型は実行時に消えるため `actions.ts`
側に定義してよい。既存の `src/features/auth/actions.ts` と `src/features/auth/state.ts`
が同じ形なので、**それらを読んでパターンを揃えること**。

- [ ] **Step 1: 初期状態の定数を作る**

`src/features/books/state.ts`:

```ts
import type { SaveBookState } from './actions';

/**
 * 本棚保存フォームの初期状態。
 *
 * 'use server' ファイル（actions.ts）は関数以外を export できないため、
 * 定数はこの非 'use server' ファイルへ分離している。
 */
export const SAVE_BOOK_INITIAL_STATE: SaveBookState = {
  errorMessage: '',
  successMessage: '',
};
```

- [ ] **Step 2: Server Action を実装**

`src/features/books/actions.ts`:

```ts
'use server';

import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  ONGOING_CAPABLE_CATEGORIES,
  type BookCategory,
} from '@/types/database';
import { userBooksCacheTag } from './keys';

export interface SaveBookState {
  errorMessage: string;
  successMessage: string;
}

const GENERIC_ERROR = '処理に失敗しました。時間をおいて再度お試しください。';
const DUPLICATE_ERROR = 'この本は既に本棚にあります。';

/** FormData から文字列を取り出す。未入力・型違いは空文字とする */
function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/** チェックボックスの値を真偽へ変換する */
function readBoolean(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on' || formData.get(key) === 'true';
}

/** 想定外の値を弾き、既定の分類へ倒す */
function readCategory(formData: FormData): BookCategory {
  const value = formData.get('category');
  if (
    value === 'tankobon' ||
    value === 'series_tankobon' ||
    value === 'light_novel' ||
    value === 'comic'
  ) {
    return value;
  }
  return 'tankobon';
}

/** 空文字を null へ寄せる。DB の nullable カラム用 */
function emptyToNull(value: string): string | null {
  return value.length === 0 ? null : value;
}

export async function saveBookAction(
  _prevState: SaveBookState,
  formData: FormData,
): Promise<SaveBookState> {
  const supabase = await createClient();

  // userId は必ず認証済みセッションから取得する。
  // フォームから渡された値を信用してはならない。
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    return { errorMessage: '認証が必要です。', successMessage: '' };
  }

  const isbn = readString(formData, 'isbn');
  const title = readString(formData, 'title');
  if (isbn.length === 0 || title.length === 0) {
    return { errorMessage: GENERIC_ERROR, successMessage: '' };
  }

  const category = readCategory(formData);
  // 単行本は DB の check 制約により連載中を持てない
  const isOngoing =
    ONGOING_CAPABLE_CATEGORIES.includes(category) &&
    readBoolean(formData, 'isOngoing');
  const isPurchased = readBoolean(formData, 'isPurchased');

  const { error } = await supabase.from('books').insert({
    user_id: user.id,
    isbn,
    title,
    title_kana: emptyToNull(readString(formData, 'titleKana')),
    author: readString(formData, 'author'),
    publisher: readString(formData, 'publisher'),
    category,
    is_ongoing: isOngoing,
    cover_image_url: emptyToNull(readString(formData, 'coverImageUrl')),
    description: emptyToNull(readString(formData, 'description')),
    is_purchased: isPurchased,
    // 購入済みのときのみ日時を入れる（DB の check 制約に合わせる）
    purchased_at: isPurchased ? new Date().toISOString() : null,
    latest_release_date: emptyToNull(readString(formData, 'releaseDate')),
    release_date_text: emptyToNull(readString(formData, 'releaseDateText')),
    item_url: emptyToNull(readString(formData, 'itemUrl')),
  });

  if (error !== null) {
    // エラーオブジェクトは出力しない。23505 は一意制約違反
    if (error.code === '23505') {
      return { errorMessage: DUPLICATE_ERROR, successMessage: '' };
    }
    return { errorMessage: GENERIC_ERROR, successMessage: '' };
  }

  revalidateTag(userBooksCacheTag(user.id));
  return {
    errorMessage: '',
    successMessage: isPurchased
      ? '購入済みとして本棚に追加しました。'
      : '本棚に追加しました。',
  };
}
```

- [ ] **Step 3: 検証**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: すべてエラーなし

**build が `TypeError: Cannot read properties of undefined` で落ちた場合**、
`actions.ts` から関数以外を export していないか確認すること。

- [ ] **Step 4: コミット**

```bash
git add src/features/books/state.ts src/features/books/actions.ts
git commit -m "$(cat <<'EOF'
feat: 本棚への保存Server Actionを実装

userId はフォームからではなく必ず認証済みセッションから取得する。
DB の check 制約に合わせ、単行本のときは連載中フラグを落とし、
未購入のときは purchased_at を null にする。

一意制約違反(23505)は「この本は既に本棚にあります。」へ変換する。
保存後に revalidateTag で本棚キャッシュを無効化する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 検索画面

**Files:**
- Create: `src/app/(app)/search/page.tsx`
- Create: `src/features/rakuten/SearchForm.tsx`
- Create: `src/features/rakuten/SearchResults.tsx`
- Create: `src/features/rakuten/SaveBookForm.tsx`
- Modify: `src/app/(app)/layout.tsx`（ヘッダーに「本を探す」リンクを追加）

**Interfaces:**
- Consumes: `getCachedRakutenSearch`（Task 4）、`getUserBooks`（Task 4）、`saveBookAction` / `SaveBookState`（Task 5）、`SAVE_BOOK_INITIAL_STATE`（Task 5）、`parseSalesDate` / `estimateCategory` / `isOngoingByDefault`（Task 1）、`BOOK_CATEGORY_LABELS` / `ONGOING_CAPABLE_CATEGORIES`（`@/types/database`）、`speakComplete` / `speakError`（`@/lib/speech`）
- Produces: ルート `/search`

- [ ] **Step 1: 検索フォームを作る**

`src/features/rakuten/SearchForm.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

/**
 * 検索フォーム。
 * 入力のたびには検索せず、送信操作でのみ発火させる。
 * 楽天APIのレート制限（毎秒1リクエスト程度）へ配慮するため。
 *
 * 初期値は useSearchParams ではなく props で受け取る。useSearchParams は
 * Suspense 境界を要求することがあり、ページ側が既に値を持っているため
 * 渡すだけで済むから。
 */
export function SearchForm({ initialKeyword }: { initialKeyword: string }) {
  const router = useRouter();
  const [keyword, setKeyword] = useState(initialKeyword);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = keyword.trim();
    if (trimmed.length === 0) {
      return;
    }
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <label htmlFor="keyword" className="sr-only">
        検索キーワード
      </label>
      <input
        id="keyword"
        name="keyword"
        type="search"
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        placeholder="タイトル・著者名で検索"
        className="flex-1 rounded border border-wood-300 bg-wood-50 px-3 py-2 text-wood-900"
      />
      <button
        type="submit"
        className="rounded bg-wood-600 px-4 py-2 font-medium text-wood-50 hover:bg-wood-700"
      >
        検索
      </button>
    </form>
  );
}
```

- [ ] **Step 2: 保存フォームを作る**

`src/features/rakuten/SaveBookForm.tsx`:

```tsx
'use client';

import { useActionState, useEffect, useState } from 'react';
import { saveBookAction } from '@/features/books/actions';
import { SAVE_BOOK_INITIAL_STATE } from '@/features/books/state';
import { speakComplete, speakError } from '@/lib/speech';
import {
  BOOK_CATEGORY_LABELS,
  ONGOING_CAPABLE_CATEGORIES,
  type BookCategory,
} from '@/types/database';

export interface SaveBookFormValues {
  isbn: string;
  title: string;
  titleKana: string;
  author: string;
  publisher: string;
  coverImageUrl: string;
  description: string;
  releaseDate: string;
  releaseDateText: string;
  itemUrl: string;
  defaultCategory: BookCategory;
  defaultIsOngoing: boolean;
}

const CATEGORY_VALUES: readonly BookCategory[] = [
  'tankobon',
  'series_tankobon',
  'light_novel',
  'comic',
];

export function SaveBookForm({
  values,
  alreadyOwned,
}: {
  values: SaveBookFormValues;
  alreadyOwned: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    saveBookAction,
    SAVE_BOOK_INITIAL_STATE,
  );
  const [category, setCategory] = useState<BookCategory>(
    values.defaultCategory,
  );
  const [isOngoing, setIsOngoing] = useState(values.defaultIsOngoing);

  useEffect(() => {
    if (state.successMessage.length > 0) {
      speakComplete();
    } else if (state.errorMessage.length > 0) {
      speakError();
    }
  }, [state.successMessage, state.errorMessage]);

  // 単行本は DB の制約により連載中を持てないため、選び直したら落とす
  const canBeOngoing = ONGOING_CAPABLE_CATEGORIES.includes(category);
  const effectiveIsOngoing = canBeOngoing && isOngoing;

  if (alreadyOwned) {
    return (
      <p className="text-sm text-wood-300">この本は本棚に追加済みです。</p>
    );
  }

  if (state.successMessage.length > 0) {
    return (
      <p role="status" className="text-sm text-wood-100">
        {state.successMessage}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="isbn" value={values.isbn} />
      <input type="hidden" name="title" value={values.title} />
      <input type="hidden" name="titleKana" value={values.titleKana} />
      <input type="hidden" name="author" value={values.author} />
      <input type="hidden" name="publisher" value={values.publisher} />
      <input type="hidden" name="coverImageUrl" value={values.coverImageUrl} />
      <input type="hidden" name="description" value={values.description} />
      <input type="hidden" name="releaseDate" value={values.releaseDate} />
      <input
        type="hidden"
        name="releaseDateText"
        value={values.releaseDateText}
      />
      <input type="hidden" name="itemUrl" value={values.itemUrl} />
      <input
        type="hidden"
        name="isOngoing"
        value={effectiveIsOngoing ? 'true' : 'false'}
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-wood-200">
          分類
          <select
            name="category"
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as BookCategory)
            }
            className="ml-2 rounded border border-wood-300 bg-wood-50 px-2 py-1 text-wood-900"
          >
            {CATEGORY_VALUES.map((value) => (
              <option key={value} value={value}>
                {BOOK_CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1 text-sm text-wood-200">
          <input
            type="checkbox"
            checked={effectiveIsOngoing}
            disabled={!canBeOngoing}
            onChange={(event) => setIsOngoing(event.target.checked)}
          />
          連載中
        </label>
      </div>

      {state.errorMessage.length > 0 && (
        <p role="alert" className="text-sm text-red-300">
          {state.errorMessage}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          name="isPurchased"
          value="false"
          disabled={isPending}
          className="rounded border border-wood-400 px-3 py-1 text-sm text-wood-100 disabled:opacity-60"
        >
          本棚に追加
        </button>
        <button
          type="submit"
          name="isPurchased"
          value="true"
          disabled={isPending}
          className="rounded bg-wood-600 px-3 py-1 text-sm font-medium text-wood-50 hover:bg-wood-700 disabled:opacity-60"
        >
          購入済みとして追加
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: 検索結果一覧を作る**

`src/features/rakuten/SearchResults.tsx`:

```tsx
import Image from 'next/image';
import type { RakutenBookItem } from './types';
import {
  estimateCategory,
  isOngoingByDefault,
  parseSalesDate,
} from './parse';
import { SaveBookForm } from './SaveBookForm';

/**
 * 検索結果の一覧。Server Component。
 * ownedIsbns は本棚に既にある ISBN の集合。
 */
export function SearchResults({
  items,
  ownedIsbns,
}: {
  items: readonly RakutenBookItem[];
  ownedIsbns: ReadonlySet<string>;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-wood-200">
        該当する書籍が見つかりませんでした。
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {items.map((item) => {
        const category = estimateCategory(item);
        const sales = parseSalesDate(item.salesDate);
        return (
          <li
            key={item.isbn}
            className="flex gap-4 rounded bg-wood-800 p-3 shadow-book"
          >
            {item.largeImageUrl.length > 0 && (
              <Image
                src={item.largeImageUrl}
                alt=""
                width={80}
                height={112}
                className="h-28 w-20 flex-none object-contain"
                unoptimized
              />
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-bold text-wood-50">{item.title}</p>
              <p className="text-sm text-wood-200">
                {item.author}／{item.publisherName}
              </p>
              {sales.text.length > 0 && (
                <p className="text-sm text-wood-300">発売日 {sales.text}</p>
              )}
              <SaveBookForm
                alreadyOwned={ownedIsbns.has(item.isbn)}
                values={{
                  isbn: item.isbn,
                  title: item.title,
                  titleKana: item.titleKana,
                  author: item.author,
                  publisher: item.publisherName,
                  coverImageUrl: item.largeImageUrl,
                  description: item.itemCaption,
                  releaseDate: sales.date ?? '',
                  releaseDateText: sales.text,
                  itemUrl: item.itemUrl,
                  defaultCategory: category,
                  defaultIsOngoing: isOngoingByDefault(
                    item.seriesName,
                    category,
                  ),
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

`alt=""` としているのは、直後に書名がテキストで出るため、読み上げの重複を避ける意図。
`unoptimized` を付けるのは、楽天の画像を Next.js の画像最適化に通さず、
`remotePatterns` の許可のみで直接読み込むため。

- [ ] **Step 4: 検索ページを作る**

`src/app/(app)/search/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getCachedRakutenSearch } from '@/features/rakuten/cache';
import { getUserBooks } from '@/features/books/cache';
import { SearchForm } from '@/features/rakuten/SearchForm';
import { SearchResults } from '@/features/rakuten/SearchResults';

export const metadata: Metadata = { title: '本を探す | Bookshelf' };

export const dynamic = 'force-dynamic';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const keyword = typeof q === 'string' ? q : '';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // userId は必ず認証済みセッションから取得する（設計書 8.1 の規則1）。
  // レイアウトで未認証は弾かれているが、型のために念のため確認する。
  const ownedIsbns = new Set<string>(
    user === null ? [] : (await getUserBooks(user.id)).map((book) => book.isbn),
  );

  const result = await getCachedRakutenSearch(keyword, 1);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-bold text-wood-50">本を探す</h1>

      <SearchForm initialKeyword={keyword} />

      {!result.ok && result.reason === 'not_configured' && (
        <p role="alert" className="rounded bg-wood-800 p-3 text-sm text-wood-100">
          楽天ウェブサービスのアプリIDが未設定です。`.env.local` に
          `RAKUTEN_APP_ID` を設定してください。
        </p>
      )}

      {!result.ok && result.reason === 'request_failed' && (
        <p role="alert" className="text-sm text-red-300">
          書籍の検索に失敗しました。時間をおいて再度お試しください。
        </p>
      )}

      {result.ok && keyword.length > 0 && (
        <>
          <p className="text-sm text-wood-300">
            「{keyword}」の検索結果 {result.count} 件
          </p>
          <SearchResults items={result.items} ownedIsbns={ownedIsbns} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: ヘッダーへ導線を追加**

`src/app/(app)/layout.tsx` の `<nav>` 内、`{role === 'admin' && (` のブロックの
**直前**へ以下を追加する:

```tsx
            <Link href="/search" className="hover:underline">
              本を探す
            </Link>
```

- [ ] **Step 6: 検証**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: すべてエラーなし。build のルート一覧に `/search` が現れる

- [ ] **Step 7: コミット**

```bash
git add "src/app/(app)/search" "src/app/(app)/layout.tsx" src/features/rakuten/SearchForm.tsx src/features/rakuten/SearchResults.tsx src/features/rakuten/SaveBookForm.tsx
git commit -m "$(cat <<'EOF'
feat: 書籍検索画面を追加

検索は入力のたびではなく送信操作でのみ発火させる。楽天APIのレート制限へ
配慮するため。保存フォームでは分類と連載中フラグを自動推定値から修正でき、
単行本を選ぶと DB の制約に合わせて連載中を落とす。

既に本棚にある ISBN は「追加済み」と表示して追加できないようにする。
APP_ID 未設定時はエラー画面ではなく設定を促す案内を出す。

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

**前提:** 以下が完了していること。未完了なら人間へ依頼する。
1. `supabase/migrations/0006_add_release_date_text.sql` の適用
2. `.env.local` への `RAKUTEN_APP_ID` の設定

- [ ] **Step 1: 自動検証**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: すべてエラー・警告なし

- [ ] **Step 2: ライトノベルのジャンルIDを実APIで確定する**

`RAKUTEN_APP_ID` 設定後、ライトノベル作品（例: 「ソードアート・オンライン」）を
検索し、レスポンスの `booksGenreId` を確認する。`parse.ts` の
`LIGHT_NOVEL_GENRE_PREFIXES` が実際の値と一致しているか検証し、違っていれば
修正して**コメントの「実APIで未検証」を削除**する。

確認方法（開発サーバーを止めた状態で実行すること）:

```bash
curl -s "https://app.rakuten.co.jp/services/api/BooksBook/Search/20170404?applicationId=$(grep '^RAKUTEN_APP_ID=' .env.local | cut -d= -f2)&formatVersion=2&keyword=ソードアート・オンライン&hits=3" | python3 -c "import sys,json;[print(i.get('title'),'|',i.get('size'),'|',i.get('booksGenreId')) for i in json.load(sys.stdin).get('Items',[])]"
```

- [ ] **Step 3: 手動での受け入れ確認**

`npm run dev` を起動し、設計書13章の受け入れ基準を順に確認する。

| # | 手順 | 期待結果 |
| --- | --- | --- |
| 1 | `/search` でキーワード検索 | 楽天APIの結果が一覧表示される |
| 2 | 同じキーワードで再検索 | 即座に返る（楽天へ再リクエストしない） |
| 3 | コミック・シリーズ物・単発本を検索 | 分類が妥当に推定されている |
| 4 | 分類を変更して保存 | 変更した分類で保存される |
| 5 | 「本棚に追加」を押す | `is_purchased=false`、`purchased_at=null` |
| 6 | 「購入済みとして追加」を押す | `is_purchased=true`、`purchased_at` に値 |
| 7 | 発売日が「◯年◯月頃」の本を保存 | `latest_release_date` が null、`release_date_text` に原文 |
| 8 | 同じ本をもう一度追加しようとする | 「追加済み」と表示され追加できない |
| 9 | 保存直後に再検索 | 「追加済み」表示が即座に反映される |
| 10 | **別アカウントでログインして `/search`** | **他人が追加した本が「追加済み」にならない** |
| 11 | `RAKUTEN_APP_ID` を一時的に空にして `/search` | エラー画面ではなく設定を促す案内が出る |

**基準10は必ず実施すること。** 設計書 8.1 のリスクに対応する唯一の実地確認である。
工程Aで作成した一般ユーザー（ようざん０２）を使う。

- [ ] **Step 4: DB で保存結果を検証**

Supabase MCP の `execute_sql` で以下を確認する（読み取りのみ）。

```sql
select title, category, is_ongoing, is_purchased,
       (purchased_at is not null) as has_purchased_at,
       latest_release_date, release_date_text, user_id
from public.books
order by created_at desc;
```

`is_purchased = false` の行で `has_purchased_at` が false であること、
`latest_release_date` が null の行に `release_date_text` が入っていることを確認する。

- [ ] **Step 5: Supabase Linter に新規警告がないことを確認**

`get_advisors` を security / performance の両方で実行する。
`0006` はカラム追加のみのため新規警告は出ない見込み。

- [ ] **Step 6: プッシュして PR を作成**

```bash
git push -u origin feature/rakuten-api
gh pr create --base main --title "feat: 楽天ブックスAPI連携とサーバーキャッシュを実装" --body "$(cat <<'EOF'
README の機能要件D（外部API連携 & キャッシュ）を実装する。

## 実装内容

- 書籍検索画面（`/search`）
- 楽天ブックスAPIクライアント（サーバー側専用）
- 分類の自動推定と保存時の手動修正
- 発売日の表記揺れ解析
- 本棚への保存（購入済み / 未購入）
- unstable_cache / revalidateTag によるサーバーキャッシュ

## 設計上の判断

発売日は「2026年秋」のような確定できない表記を返すため、確定日のみ
latest_release_date に入れ、原文は新設の release_date_text に保持する。
曖昧な表記をその月の1日などと解釈すると、カレンダーに実在しない予定を
作ってしまうため。

## 注意が必要な箇所

unstable_cache の内部では cookies() を読めないため、本棚一覧の取得は
RLS を迂回する管理者クライアントを使っている。RLS の保護が外れ userId の
正しさだけが唯一の防壁になるため、キーとタグの生成を純粋関数へ集約して
テストで固定し、クエリの user_id 絞り込みとあわせて多重に守っている。
詳細は設計書 8.1 章。

## 検証

- typecheck / lint / test / build すべてエラーなし
- 設計書13章の受け入れ基準を手動確認済み（別アカウントでの分離確認を含む）

## マージ後に必要な作業

なし（0006 は適用済み）。

## ドキュメント

- 設計書: docs/superpowers/specs/2026-09-10-rakuten-api-design.md
- 実装計画: docs/superpowers/plans/2026-09-10-rakuten-api.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7: 音声案内を鳴らして人間へ承認を求める**

```bash
say -v Kyoko -r 200 "実装が完了しました。プルリクエストの承認をお願いします。"
```

マージは人間の承認を得てから行う（CLAUDE.md 3章）。
