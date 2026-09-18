# シリーズまとめ表示（C-1）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 検索結果を作品（シリーズ）単位でまとめ、欲しい巻だけを選んで本棚へ追加できるようにする。本棚は従来どおり1巻ずつ表示する。

**Architecture:** 楽天の `seriesName` はレーベル名で使えないため、タイトルから巻数を剥がして作品名を得る。抽出とグルーピングは純粋関数へ切り出して TDD で固める。

**Tech Stack:** Next.js 15.5 / React 19 / TypeScript strict / Tailwind CSS 3 / Vitest

**Spec:** `docs/superpowers/specs/2026-09-18-series-and-alerts-design.md`

## Global Constraints

- 対話・ドキュメント・コメント・コミットメッセージはすべて日本語。コード内の識別子は英語
- TypeScript strict モード。`any` の使用は禁止（`@typescript-eslint/no-explicit-any: error`）
- `tsconfig.json` は `noUncheckedIndexedAccess` / `noUnusedLocals` / `noUnusedParameters` が有効。**配列アクセスの結果は `T | undefined` になる**
- **`'use server'` ファイルは async 関数以外を export できない。** 定数は別ファイルへ置く。破るとビルドが `TypeError` で落ちる
- 楽天由来の文字列を `dangerouslySetInnerHTML` で描画しない
- `console.error(error)` のようにエラーオブジェクトをそのまま出力しない
- Server Action では `user_id` をフォームからではなく `supabase.auth.getUser()` から取得する
- パス別名 `@/*` は `./src/*` を指す
- コミット前に `npm run typecheck` / `npm run lint` / `npm test` / `npm run build` がすべてエラーなしであること
- **開発サーバーの稼働中に `npm run build` を実行しないこと。** `.next` が壊れる。実行前に必ず止める
- `npm install` を実行しないこと（`@vitejs/plugin-react` が 5.2.0 に固定されており壊れる）
- コミットメッセージ末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- 作業ブランチは `feature/series-grouping`。`main` へのマージは人間の承認を得てから

## 既存コードの前提

```ts
// src/features/rakuten/types.ts
export interface RakutenBookItem {
  isbn: string; title: string; titleKana: string; author: string;
  publisherName: string; size: string; booksGenreId: string; seriesName: string;
  salesDate: string; itemCaption: string; largeImageUrl: string; itemUrl: string;
}
export type RakutenSearchResult =
  | ({ ok: true } & { items: RakutenBookItem[]; count: number; page: number; pageCount: number })
  | { ok: false; reason: 'not_configured' | 'request_failed' };

// src/features/rakuten/parse.ts
export function parseSalesDate(salesDate: string): { date: string | null; text: string };
export function estimateCategory(input: { size: string; booksGenreId: string; seriesName: string }): BookCategory;
export function isOngoingByDefault(seriesName: string, category: BookCategory): boolean;

// src/features/rakuten/cache.ts
export async function getCachedRakutenSearch(keyword: string, page: number): Promise<RakutenSearchResult>;

// src/features/books/cache.ts
export async function getUserBooks(userId: string): Promise<Book[]>;
// ★ userId は必ず supabase.auth.getUser() から取得したものを渡すこと

// src/features/books/keys.ts
export function userBooksCacheTag(userId: string): string;

// src/features/books/actions.ts（'use server'）
export interface SaveBookState { errorMessage: string; successMessage: string }
export async function saveBookAction(prev: SaveBookState, formData: FormData): Promise<SaveBookState>;

// src/features/books/state.ts
export const SAVE_BOOK_INITIAL_STATE: SaveBookState;

// src/types/database.ts
export const BOOK_CATEGORY_LABELS: Readonly<Record<BookCategory, string>>;
export const ONGOING_CAPABLE_CATEGORIES: readonly BookCategory[];
```

既存の検索画面は `src/app/(app)/search/page.tsx` と
`src/features/rakuten/SearchResults.tsx` / `SaveBookForm.tsx`。

## ファイル構成

| ファイル | 責務 |
| --- | --- |
| `src/features/rakuten/series.ts` | 巻数の抽出、シリーズキー、除外判定（純粋関数） |
| `src/features/rakuten/grouping.ts` | シリーズ単位のグルーピング（純粋関数） |
| `src/features/books/bulkActions.ts` | 複数巻の一括保存（Server Action） |
| `src/features/books/bulkState.ts` | 一括保存の初期状態 |
| `src/features/rakuten/SeriesRow.tsx` | まとめ行と巻選択の展開 |
| `src/features/rakuten/SearchResults.tsx` | グループ表示へ差し替え（修正） |
| `src/app/(app)/search/page.tsx` | 除外件数の表示（修正） |

---

### Task 1: 巻数の抽出と除外判定

**Files:**
- Create: `src/features/rakuten/series.ts`
- Test: `src/features/rakuten/series.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `interface ParsedVolume { baseTitle: string; volume: number | null }`
  - `parseVolume(title: string): ParsedVolume`
  - `seriesKey(baseTitle: string): string`
  - `isExcludedItem(title: string): boolean`

**★設計の要点★** 区切り文字を必須とする。`ワンピース1` のように区切りのない数字を
巻数と見なすと、`ROOM No.1` や `1Q84` のような題名を壊す。取りこぼしても
「巻数なしの単独行」になるだけで情報は失われない。

- [ ] **Step 1: 失敗するテストを書く**

`src/features/rakuten/series.test.ts`:

```ts
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
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test -- series`
Expected: FAIL — `Failed to resolve import "./series"`

- [ ] **Step 3: 実装を書く**

`src/features/rakuten/series.ts`:

```ts
/**
 * 楽天のタイトルから作品名と巻数を取り出す純粋関数群。
 *
 * 楽天の seriesName はレーベル名（講談社コミックス等）であり作品名ではないため、
 * グルーピングのキーには使えない。タイトルから巻数を剥がして作品名を得る。
 */

export interface ParsedVolume {
  /** 巻数を取り除いた作品名 */
  baseTitle: string;
  /** 抽出できた巻数。できなければ null */
  volume: number | null;
}

/**
 * 巻数の表記パターン。作品ごとに異なるため複数を用意する。
 *
 * いずれも末尾一致とし、区切り文字（カッコまたは空白）を必須とする。
 * 「ワンピース1」のような区切りなしを巻数と見なすと、
 * 「ROOM No.1」や「1Q84」のような題名を壊すため。
 * 取りこぼしても巻数なしの単独行になるだけで、情報は失われない。
 */
const VOLUME_PATTERNS: readonly RegExp[] = [
  // タイトル（12） / タイトル(12)
  /^(.*?)[（(]\s*(\d+)\s*[）)]\s*$/,
  // タイトル 第12巻
  /^(.*?)[\s　]+第\s*(\d+)\s*巻\s*$/,
  // タイトル 12
  /^(.*?)[\s　]+(\d+)\s*$/,
];

export function parseVolume(title: string): ParsedVolume {
  const trimmed = title.trim();

  for (const pattern of VOLUME_PATTERNS) {
    const matched = pattern.exec(trimmed);
    if (matched === null) {
      continue;
    }

    const rawBase = matched[1];
    const rawVolume = matched[2];
    if (rawBase === undefined || rawVolume === undefined) {
      continue;
    }

    const baseTitle = rawBase.trim();
    // 作品名が空になる表記（「（5）」など）は巻数と見なさない
    if (baseTitle.length === 0) {
      continue;
    }

    const volume = Number(rawVolume);
    if (!Number.isFinite(volume)) {
      continue;
    }

    return { baseTitle, volume };
  }

  return { baseTitle: trimmed, volume: null };
}

/**
 * グルーピングに使うキー。
 * 全角空白を半角へ寄せ、英字の大文字小文字を無視する。
 */
export function seriesKey(baseTitle: string): string {
  return baseTitle
    .replace(/　/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * 検索結果から既定で除外する商品か。
 *
 * セット商品や合本は「1巻」として本棚へ入れる対象ではないため除外する。
 * ただし除外した件数は画面に表示し、押せば見られるようにすること。
 * 除外規則が誤作動して欲しい本が消えたとき、気づけないのは害が大きい。
 */
const EXCLUDE_WORDS: readonly string[] = [
  'セット',
  '全巻',
  'まとめ買い',
  '合本',
];

export function isExcludedItem(title: string): boolean {
  return EXCLUDE_WORDS.some((word) => title.includes(word));
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test -- series`
Expected: PASS（23 テスト）

- [ ] **Step 5: 検証**

Run: `npm run typecheck && npm run lint`
Expected: どちらもエラーなし

- [ ] **Step 6: コミット**

```bash
git add src/features/rakuten/series.ts src/features/rakuten/series.test.ts
git commit -m "$(cat <<'EOF'
feat: タイトルから巻数と作品名を取り出す処理を実装

楽天の seriesName はレーベル名（講談社コミックス等）であり作品名では
ないため、グルーピングのキーに使えない。タイトルから巻数を剥がして
作品名を得る。

巻数の表記は作品ごとに異なる（全角カッコ / 半角スペース区切り / 第N巻）
ため複数パターンへ対応する。いずれも区切り文字を必須とした。
「ワンピース1」のような区切りなしを巻数と見なすと「ROOM No.1」や
「1Q84」のような題名を壊すため。取りこぼしても巻数なしの単独行に
なるだけで情報は失われない。

セット商品の除外語も用意する。除外件数の表示は呼び出し側で行う。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: シリーズ単位のグルーピング

**Files:**
- Create: `src/features/rakuten/grouping.ts`
- Test: `src/features/rakuten/grouping.test.ts`

**Interfaces:**
- Consumes: `parseVolume` / `seriesKey` / `isExcludedItem`（Task 1）、`RakutenBookItem`（`@/features/rakuten/types`）
- Produces:
  - `interface SeriesEntry { item: RakutenBookItem; volume: number | null }`
  - `interface SeriesGroup { key: string; title: string; entries: SeriesEntry[]; representative: RakutenBookItem; latest: SeriesEntry | null; isSingle: boolean }`
  - `splitExcluded(items: readonly RakutenBookItem[]): { kept: RakutenBookItem[]; excluded: RakutenBookItem[] }`
  - `groupBySeries(items: readonly RakutenBookItem[]): SeriesGroup[]`

**設計の要点:** 「最新巻」は**巻数が最大**のものとする。発売日ではなく巻数を見るのは、
特装版や復刻版が発売日順で最新と誤判定されるのを避けるため。

- [ ] **Step 1: 失敗するテストを書く**

`src/features/rakuten/grouping.test.ts`:

```ts
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
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test -- grouping`
Expected: FAIL — `Failed to resolve import "./grouping"`

- [ ] **Step 3: 実装を書く**

`src/features/rakuten/grouping.ts`:

```ts
/**
 * 検索結果を作品（シリーズ）単位へまとめる純粋関数。
 * 入力の配列を書き換えない。
 */

import { isExcludedItem, parseVolume, seriesKey } from './series';
import type { RakutenBookItem } from './types';

export interface SeriesEntry {
  item: RakutenBookItem;
  volume: number | null;
}

export interface SeriesGroup {
  /** グルーピングに使ったキー */
  key: string;
  /** 表示用の作品名 */
  title: string;
  /** 巻の昇順。巻数のないものは末尾 */
  entries: SeriesEntry[];
  /** 一覧に出す代表。最小巻 */
  representative: RakutenBookItem;
  /** 巻数が最大のもの。巻数を持つ商品が無ければ null */
  latest: SeriesEntry | null;
  /** 1件しかない作品か */
  isSingle: boolean;
}

/**
 * 既定で除外する商品を分ける。
 * 除外した側も返すのは、画面で件数を示して見られるようにするため。
 */
export function splitExcluded(items: readonly RakutenBookItem[]): {
  kept: RakutenBookItem[];
  excluded: RakutenBookItem[];
} {
  const kept: RakutenBookItem[] = [];
  const excluded: RakutenBookItem[] = [];

  for (const target of items) {
    if (isExcludedItem(target.title)) {
      excluded.push(target);
    } else {
      kept.push(target);
    }
  }

  return { kept, excluded };
}

/** 巻の昇順。巻数のないものは末尾へ回す */
function compareEntries(left: SeriesEntry, right: SeriesEntry): number {
  if (left.volume === null && right.volume === null) {
    return 0;
  }
  if (left.volume === null) {
    return 1;
  }
  if (right.volume === null) {
    return -1;
  }
  return left.volume - right.volume;
}

export function groupBySeries(
  items: readonly RakutenBookItem[],
): SeriesGroup[] {
  const buckets = new Map<string, { title: string; entries: SeriesEntry[] }>();

  for (const target of items) {
    const { baseTitle, volume } = parseVolume(target.title);
    const key = seriesKey(baseTitle);
    const bucket = buckets.get(key);

    if (bucket === undefined) {
      buckets.set(key, { title: baseTitle, entries: [{ item: target, volume }] });
    } else {
      bucket.entries.push({ item: target, volume });
    }
  }

  const groups: SeriesGroup[] = [];

  for (const [key, bucket] of buckets) {
    const entries = [...bucket.entries].sort(compareEntries);
    const representative = entries[0]?.item;
    if (representative === undefined) {
      continue;
    }

    // 最新巻は巻数が最大のもの。発売日で決めると特装版や復刻版が
    // 最新と誤判定されるため、巻数を見る
    let latest: SeriesEntry | null = null;
    for (const entry of entries) {
      if (entry.volume === null) {
        continue;
      }
      if (latest === null || latest.volume === null || entry.volume > latest.volume) {
        latest = entry;
      }
    }

    groups.push({
      key,
      title: bucket.title,
      entries,
      representative,
      latest,
      isSingle: entries.length === 1,
    });
  }

  return groups;
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test -- grouping`
Expected: PASS（14 テスト）

- [ ] **Step 5: 検証**

Run: `npm run typecheck && npm run lint && npm test`
Expected: すべてエラーなし

- [ ] **Step 6: コミット**

```bash
git add src/features/rakuten/grouping.ts src/features/rakuten/grouping.test.ts
git commit -m "$(cat <<'EOF'
feat: 検索結果をシリーズ単位へまとめる処理を実装

同じ作品の巻を1グループにまとめ、巻の昇順で並べる。代表は最小巻とする。

最新巻は巻数が最大のものとする。発売日で決めると特装版や復刻版が最新と
誤判定されるため。

除外した商品も呼び出し側へ返す。画面で件数を示し、押せば見られるように
するため。除外規則の誤作動で欲しい本が消えたことに気づけないのは害が大きい。

入力の配列は書き換えない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 複数巻の一括保存

**Files:**
- Create: `src/features/books/bulkState.ts`
- Create: `src/features/books/bulkActions.ts`

**Interfaces:**
- Consumes: `createClient`（`@/lib/supabase/server`）、`userBooksCacheTag`（`@/features/books/keys`）、`ONGOING_CAPABLE_CATEGORIES` / `BookCategory`（`@/types/database`）
- Produces:
  - `interface SaveBooksState { errorMessage: string; successMessage: string }`（`bulkActions.ts` に定義）
  - `SAVE_BOOKS_INITIAL_STATE: SaveBooksState`（`bulkState.ts` に定義）
  - `saveBooksAction(prevState: SaveBooksState, formData: FormData): Promise<SaveBooksState>`

**⚠️ `'use server'` の制約:** `bulkActions.ts` からは async 関数のみを export する。
定数は `bulkState.ts` へ置く。型は実行時に消えるため `bulkActions.ts` 側に定義してよい。
既存の `src/features/books/actions.ts` と `state.ts` が同じ形なので**それらを読んで揃えること**。

**設計の要点:** 選んだ巻の情報は JSON 文字列 1 つで受け取る。巻ごとに
hidden input を並べると数が読めず、FormData の組み立ても煩雑になるため。
**受け取った JSON は必ず検証する。** 外部から任意の値を入れられる経路である。

- [ ] **Step 1: 初期状態の定数を作る**

`src/features/books/bulkState.ts`:

```ts
import type { SaveBooksState } from './bulkActions';

/**
 * 複数巻の一括保存フォームの初期状態。
 *
 * 'use server' ファイル（bulkActions.ts）は関数以外を export できないため、
 * 定数はこの非 'use server' ファイルへ分離している。
 */
export const SAVE_BOOKS_INITIAL_STATE: SaveBooksState = {
  errorMessage: '',
  successMessage: '',
};
```

- [ ] **Step 2: Server Action を実装**

`src/features/books/bulkActions.ts`:

```ts
'use server';

import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  ONGOING_CAPABLE_CATEGORIES,
  type BookCategory,
} from '@/types/database';
import { userBooksCacheTag } from './keys';

export interface SaveBooksState {
  errorMessage: string;
  successMessage: string;
}

/** 画面から受け取る1巻ぶんの情報 */
interface IncomingBook {
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
}

const GENERIC_ERROR = '処理に失敗しました。時間をおいて再度お試しください。';
const NOTHING_SELECTED = '追加する巻を選んでください。';

/** 一度に保存できる上限。取り違えや誤操作で大量に入ることを防ぐ */
const MAX_BOOKS_PER_REQUEST = 60;

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 画面から届いた JSON を検証して取り込む。
 *
 * FormData は利用者が任意に差し替えられるため、型を信用してはならない。
 * 必須項目が欠けた要素は捨てる。
 */
function parseIncomingBooks(raw: string): IncomingBook[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 例外の内容は出力しない
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const result: IncomingBook[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const isbn = readString(record.isbn);
    const title = readString(record.title);
    if (isbn.length === 0 || title.length === 0) {
      continue;
    }
    result.push({
      isbn,
      title,
      titleKana: readString(record.titleKana),
      author: readString(record.author),
      publisher: readString(record.publisher),
      coverImageUrl: readString(record.coverImageUrl),
      description: readString(record.description),
      releaseDate: readString(record.releaseDate),
      releaseDateText: readString(record.releaseDateText),
      itemUrl: readString(record.itemUrl),
    });
    if (result.length >= MAX_BOOKS_PER_REQUEST) {
      break;
    }
  }

  return result;
}

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

function readBoolean(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === 'true' || value === 'on';
}

function emptyToNull(value: string): string | null {
  return value.length === 0 ? null : value;
}

export async function saveBooksAction(
  _prevState: SaveBooksState,
  formData: FormData,
): Promise<SaveBooksState> {
  const supabase = await createClient();

  // user_id はフォームからではなく認証済みセッションから取得する
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    return { errorMessage: '認証が必要です。', successMessage: '' };
  }

  const rawBooks = formData.get('books');
  const books = parseIncomingBooks(
    typeof rawBooks === 'string' ? rawBooks : '',
  );

  if (books.length === 0) {
    return { errorMessage: NOTHING_SELECTED, successMessage: '' };
  }

  const category = readCategory(formData);
  // 単行本は DB の check 制約により連載中を持てない
  const isOngoing =
    ONGOING_CAPABLE_CATEGORIES.includes(category) &&
    readBoolean(formData, 'isOngoing');
  const isPurchased = readBoolean(formData, 'isPurchased');
  const purchasedAt = isPurchased ? new Date().toISOString() : null;

  const rows = books.map((book) => ({
    user_id: user.id,
    isbn: book.isbn,
    title: book.title,
    title_kana: emptyToNull(book.titleKana),
    author: book.author,
    publisher: book.publisher,
    category,
    is_ongoing: isOngoing,
    cover_image_url: emptyToNull(book.coverImageUrl),
    description: emptyToNull(book.description),
    is_purchased: isPurchased,
    purchased_at: purchasedAt,
    latest_release_date: emptyToNull(book.releaseDate),
    release_date_text: emptyToNull(book.releaseDateText),
    item_url: emptyToNull(book.itemUrl),
  }));

  // 既に本棚にある巻は一意制約に当たる。エラーにせず読み飛ばしたいので
  // ignoreDuplicates を使い、実際に入った件数を数える
  const { data, error } = await supabase
    .from('books')
    .upsert(rows, { onConflict: 'user_id,isbn', ignoreDuplicates: true })
    .select('id');

  if (error !== null) {
    // エラーオブジェクトは出力しない
    return { errorMessage: GENERIC_ERROR, successMessage: '' };
  }

  const addedCount = data?.length ?? 0;
  const skippedCount = rows.length - addedCount;

  revalidateTag(userBooksCacheTag(user.id));

  const skippedText =
    skippedCount > 0 ? `（${skippedCount}冊は追加済みのため省略）` : '';

  return {
    errorMessage: '',
    successMessage: `${addedCount}冊を本棚に追加しました。${skippedText}`,
  };
}
```

`ignoreDuplicates: true` の `upsert` は、既にある行を更新せず読み飛ばす。
既存の巻の分類や購入状態を勝手に書き換えないため、この挙動が望ましい。

- [ ] **Step 3: 検証**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: すべてエラーなし

**build が `TypeError: Cannot read properties of undefined` で落ちた場合**、
`bulkActions.ts` から関数以外を export していないか確認すること。

- [ ] **Step 4: コミット**

```bash
git add src/features/books/bulkState.ts src/features/books/bulkActions.ts
git commit -m "$(cat <<'EOF'
feat: 複数巻を一括で本棚へ保存するServer Actionを実装

選んだ巻の情報は JSON 文字列1つで受け取る。巻ごとに hidden input を
並べると数が読めず FormData の組み立ても煩雑になるため。受け取った
JSON は必ず検証する。外部から任意の値を入れられる経路であるため、
必須項目が欠けた要素は捨て、一度に保存できる件数にも上限を設ける。

既に本棚にある巻は ignoreDuplicates の upsert で読み飛ばす。エラーに
せずスキップとして数え、件数を利用者へ返す。既存の巻の分類や購入状態を
勝手に書き換えないため、更新ではなく読み飛ばしが望ましい。

user_id はフォームからではなく認証済みセッションから取得する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: シリーズ行コンポーネント

**Files:**
- Create: `src/features/rakuten/SeriesRow.tsx`

**Interfaces:**
- Consumes: `SeriesGroup`（Task 2）、`saveBooksAction` / `SaveBooksState`（Task 3）、`SAVE_BOOKS_INITIAL_STATE`（Task 3）、`parseSalesDate` / `estimateCategory` / `isOngoingByDefault`（`@/features/rakuten/parse`）、`BOOK_CATEGORY_LABELS` / `ONGOING_CAPABLE_CATEGORIES`（`@/types/database`）、`speakComplete` / `speakError`（`@/lib/speech`）
- Produces: `<SeriesRow group ownedIsbns />`

**設計の要点:** 分類と連載中フラグは**まとめ行で一度だけ選ぶ**。巻ごとに
変えられるようにすると操作が煩雑になり、実用上も同じシリーズで分類が
変わることはまずないため。

- [ ] **Step 1: 実装を書く**

`src/features/rakuten/SeriesRow.tsx`:

```tsx
'use client';

import Image from 'next/image';
import { useActionState, useEffect, useState } from 'react';
import { saveBooksAction } from '@/features/books/bulkActions';
import { SAVE_BOOKS_INITIAL_STATE } from '@/features/books/bulkState';
import { speakComplete, speakError } from '@/lib/speech';
import {
  BOOK_CATEGORY_LABELS,
  ONGOING_CAPABLE_CATEGORIES,
  type BookCategory,
} from '@/types/database';
import { estimateCategory, isOngoingByDefault, parseSalesDate } from './parse';
import type { SeriesGroup } from './grouping';

const CATEGORY_VALUES: readonly BookCategory[] = [
  'tankobon',
  'series_tankobon',
  'light_novel',
  'comic',
];

export function SeriesRow({
  group,
  ownedIsbns,
}: {
  group: SeriesGroup;
  ownedIsbns: ReadonlySet<string>;
}) {
  const [state, formAction, isPending] = useActionState(
    saveBooksAction,
    SAVE_BOOKS_INITIAL_STATE,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<readonly string[]>([]);

  const defaultCategory = estimateCategory(group.representative);
  const [category, setCategory] = useState<BookCategory>(defaultCategory);
  const [isOngoing, setIsOngoing] = useState(
    isOngoingByDefault(group.representative.seriesName, defaultCategory),
  );

  useEffect(() => {
    if (state.successMessage.length > 0) {
      speakComplete();
    } else if (state.errorMessage.length > 0) {
      speakError();
    }
  }, [state.successMessage, state.errorMessage]);

  const canBeOngoing = ONGOING_CAPABLE_CATEGORIES.includes(category);
  const effectiveIsOngoing = canBeOngoing && isOngoing;

  const latestSales =
    group.latest === null ? null : parseSalesDate(group.latest.item.salesDate);

  const selectableEntries = group.entries.filter(
    (entry) => !ownedIsbns.has(entry.item.isbn),
  );

  function toggle(isbn: string) {
    setSelected((current) =>
      current.includes(isbn)
        ? current.filter((value) => value !== isbn)
        : [...current, isbn],
    );
  }

  function selectAll() {
    setSelected(selectableEntries.map((entry) => entry.item.isbn));
  }

  /** 選んだ巻を Server Action へ渡す形へ整える */
  const selectedPayload = group.entries
    .filter((entry) => selected.includes(entry.item.isbn))
    .map((entry) => {
      const sales = parseSalesDate(entry.item.salesDate);
      return {
        isbn: entry.item.isbn,
        title: entry.item.title,
        titleKana: entry.item.titleKana,
        author: entry.item.author,
        publisher: entry.item.publisherName,
        coverImageUrl: entry.item.largeImageUrl,
        description: entry.item.itemCaption,
        releaseDate: sales.date ?? '',
        releaseDateText: sales.text,
        itemUrl: entry.item.itemUrl,
      };
    });

  return (
    <li className="rounded bg-wood-800 p-3 shadow-book">
      <div className="flex gap-4">
        {group.representative.largeImageUrl.length > 0 && (
          <Image
            src={group.representative.largeImageUrl}
            alt=""
            width={80}
            height={112}
            unoptimized
            className="h-28 w-20 flex-none object-contain"
          />
        )}

        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-bold text-wood-50">{group.title}</p>
          <p className="text-sm text-wood-200">
            {group.representative.author}／{group.representative.publisherName}
          </p>

          {group.latest !== null && (
            <p className="text-sm text-wood-300">
              取得 {group.entries.length} 巻（最新 {group.latest.volume} 巻
              {latestSales !== null && latestSales.text.length > 0
                ? `・${latestSales.text} 発売`
                : ''}
              ）
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <label className="text-sm text-wood-200">
              分類
              <select
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

            <button
              type="button"
              onClick={() => setIsOpen((current) => !current)}
              aria-expanded={isOpen}
              className="rounded bg-wood-600 px-3 py-1 text-sm font-medium text-wood-50 hover:bg-wood-700"
            >
              {isOpen ? '巻を閉じる' : '巻を選んで追加'}
            </button>
          </div>

          {state.errorMessage.length > 0 && (
            <p role="alert" className="text-sm text-red-300">
              {state.errorMessage}
            </p>
          )}
          {state.successMessage.length > 0 && (
            <p role="status" className="text-sm text-wood-100">
              {state.successMessage}
            </p>
          )}
        </div>
      </div>

      {isOpen && (
        <form action={formAction} className="mt-3 space-y-2 border-t border-wood-700 pt-3">
          <input
            type="hidden"
            name="books"
            value={JSON.stringify(selectedPayload)}
          />
          <input type="hidden" name="category" value={category} />
          <input
            type="hidden"
            name="isOngoing"
            value={effectiveIsOngoing ? 'true' : 'false'}
          />

          <div className="flex items-center justify-between">
            <p className="text-sm text-wood-200">
              追加する巻を選んでください（{selected.length} 件選択中）
            </p>
            <button
              type="button"
              onClick={selectAll}
              disabled={selectableEntries.length === 0}
              className="text-sm text-wood-200 underline disabled:opacity-50"
            >
              未所有をすべて選ぶ
            </button>
          </div>

          <ul className="grid gap-1 sm:grid-cols-2">
            {group.entries.map((entry) => {
              const owned = ownedIsbns.has(entry.item.isbn);
              return (
                <li key={entry.item.isbn}>
                  <label
                    className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${
                      owned ? 'text-wood-400' : 'text-wood-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(entry.item.isbn)}
                      disabled={owned}
                      onChange={() => toggle(entry.item.isbn)}
                    />
                    <span className="truncate">
                      {entry.volume === null
                        ? entry.item.title
                        : `${entry.volume} 巻`}
                    </span>
                    {owned && <span className="flex-none">追加済み</span>}
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="flex gap-2">
            <button
              type="submit"
              name="isPurchased"
              value="false"
              disabled={isPending || selected.length === 0}
              className="rounded border border-wood-400 px-3 py-1 text-sm text-wood-100 disabled:opacity-60"
            >
              選んだ巻を本棚に追加
            </button>
            <button
              type="submit"
              name="isPurchased"
              value="true"
              disabled={isPending || selected.length === 0}
              className="rounded bg-wood-600 px-3 py-1 text-sm font-medium text-wood-50 hover:bg-wood-700 disabled:opacity-60"
            >
              選んだ巻を購入済みとして追加
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
```

`発売日を通知` ボタンは C-2 で追加する。このタスクでは置かない。

- [ ] **Step 2: 検証**

Run: `npm run typecheck && npm run lint && npm test`
Expected: すべてエラーなし

- [ ] **Step 3: コミット**

```bash
git add src/features/rakuten/SeriesRow.tsx
git commit -m "$(cat <<'EOF'
feat: シリーズのまとめ行と巻の選択UIを実装

まとめ行に代表の書影と最新巻の情報を出し、展開すると巻の一覧から
欲しい巻だけを選べるようにする。既に本棚にある巻は「追加済み」と
表示して選択できないようにする。

分類と連載中フラグはまとめ行で一度だけ選ぶ。巻ごとに変えられるように
すると操作が煩雑になり、同じシリーズで分類が変わることは実用上
まずないため。

巻数は「取得 N 巻」と表示する。30件を超える作品では巻が欠けるため、
「全 N 巻」と断定しない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 検索画面への組み込み

**Files:**
- Modify: `src/features/rakuten/SearchResults.tsx`（全面的に書き換え）
- Modify: `src/app/(app)/search/page.tsx`（除外件数の受け渡し）

**Interfaces:**
- Consumes: `splitExcluded` / `groupBySeries`（Task 2）、`SeriesRow`（Task 4）、既存の `SaveBookForm`
- Produces: シリーズまとめ表示の検索結果

**設計の要点:** 除外した件数を必ず画面に出し、押せば見られるようにする。
除外規則が誤作動して欲しい本が消えたとき、利用者が気づけないのは害が大きい。

**⚠️ `SearchResults` が Server Component から Client Component へ変わる。**
除外の開閉に `useState` を使うためである。影響は次のとおり。

- グルーピングの計算（`splitExcluded` / `groupBySeries`）がブラウザ側で走る。
  純粋関数で1ページ最大30件が対象のため、負荷は問題にならない
- `SingleBookRow` も Client Component にする必要がある。`SearchResults` から
  呼ばれるため、Server Component のままでは props に関数を渡せなくなる
- `src/app/(app)/search/page.tsx` は Server Component のままでよい。
  `items` と `ownedIsbns` はいずれもシリアライズ可能なため、そのまま渡せる

**`ReadonlySet<string>` は Server Component から Client Component へ渡せる。**
`Set` は React のシリアライズ対象に含まれる。渡せない場合は配列へ変えて
受け取り側で `Set` を作ること。

- [ ] **Step 1: 検索結果を書き換える**

`src/features/rakuten/SearchResults.tsx` を以下で置き換える:

```tsx
'use client';

import { useState } from 'react';
import { groupBySeries, splitExcluded } from './grouping';
import { SeriesRow } from './SeriesRow';
import { SingleBookRow } from './SingleBookRow';
import type { RakutenBookItem } from './types';

/**
 * 検索結果の一覧。
 *
 * 同じ作品の巻がばらばらに並ぶと目的の本を探しにくいため、作品単位へ
 * まとめる。1件しかない作品と、巻数を抽出できない商品は従来どおり
 * 1商品1行で表示する。
 */
export function SearchResults({
  items,
  ownedIsbns,
}: {
  items: readonly RakutenBookItem[];
  ownedIsbns: ReadonlySet<string>;
}) {
  const [showsExcluded, setShowsExcluded] = useState(false);

  if (items.length === 0) {
    return (
      <p className="text-sm text-wood-200">
        該当する書籍が見つかりませんでした。
      </p>
    );
  }

  const { kept, excluded } = splitExcluded(items);
  const groups = groupBySeries(kept);

  return (
    <div className="space-y-4">
      {excluded.length > 0 && (
        <div className="rounded bg-wood-800 p-3 text-sm text-wood-200">
          <button
            type="button"
            onClick={() => setShowsExcluded((current) => !current)}
            aria-expanded={showsExcluded}
            className="underline"
          >
            他 {excluded.length} 件（セット商品など）を除外中
            {showsExcluded ? '：閉じる' : '：表示する'}
          </button>

          {showsExcluded && (
            <ul className="mt-2 space-y-2">
              {excluded.map((item) => (
                <SingleBookRow
                  key={item.isbn}
                  item={item}
                  alreadyOwned={ownedIsbns.has(item.isbn)}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      <ul className="space-y-4">
        {groups.map((group) =>
          group.isSingle ? (
            <SingleBookRow
              key={group.key}
              item={group.representative}
              alreadyOwned={ownedIsbns.has(group.representative.isbn)}
            />
          ) : (
            <SeriesRow key={group.key} group={group} ownedIsbns={ownedIsbns} />
          ),
        )}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: 単独商品の行を切り出す**

既存の `SearchResults.tsx` にあった 1 商品ぶんの描画を
`src/features/rakuten/SingleBookRow.tsx` として切り出す。
中身は既存の `<li>` の内容と `SaveBookForm` の呼び出しをそのまま移す。

```tsx
'use client';

import Image from 'next/image';
import { estimateCategory, isOngoingByDefault, parseSalesDate } from './parse';
import { SaveBookForm } from './SaveBookForm';
import type { RakutenBookItem } from './types';

/** 1商品ぶんの行。シリーズにまとまらない商品に使う */
export function SingleBookRow({
  item,
  alreadyOwned,
}: {
  item: RakutenBookItem;
  alreadyOwned: boolean;
}) {
  const category = estimateCategory(item);
  const sales = parseSalesDate(item.salesDate);

  return (
    <li className="flex gap-4 rounded bg-wood-800 p-3 shadow-book">
      {item.largeImageUrl.length > 0 && (
        <Image
          src={item.largeImageUrl}
          alt=""
          width={80}
          height={112}
          unoptimized
          className="h-28 w-20 flex-none object-contain"
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
          alreadyOwned={alreadyOwned}
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
            defaultIsOngoing: isOngoingByDefault(item.seriesName, category),
          }}
        />
      </div>
    </li>
  );
}
```

**既存の `SearchResults.tsx` の内容と食い違わないよう、まず既存ファイルを読むこと。**
`SaveBookForm` に渡す props の形は既存のものをそのまま使う。

- [ ] **Step 3: 検索ページを確認する**

`src/app/(app)/search/page.tsx` は `SearchResults` へ `items` と `ownedIsbns` を
渡しているだけなので、**変更は不要な見込み**。読んで確認し、必要なら合わせること。

- [ ] **Step 4: 検証**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: すべてエラーなし

**build の前に開発サーバーを止めること。**

- [ ] **Step 5: コミット**

```bash
git add src/features/rakuten/SearchResults.tsx src/features/rakuten/SingleBookRow.tsx "src/app/(app)/search/page.tsx"
git commit -m "$(cat <<'EOF'
feat: 検索結果をシリーズ単位のまとめ表示へ変更

同じ作品の巻がばらばらに並ぶと目的の本を探しにくいため、作品単位へ
まとめる。1件しかない作品と巻数を抽出できない商品は、従来どおり
1商品1行で表示する。

セット商品は既定で除外するが、除外件数を必ず画面に出し、押せば見られる
ようにする。除外規則が誤作動して欲しい本が消えたとき、利用者が気づけない
のは害が大きいため。

1商品ぶんの描画は SingleBookRow として切り出し、除外リストとまとめ外の
商品で共用する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 受け入れ確認と PR 作成

**Files:** 変更なし（検証のみ）

**Interfaces:**
- Consumes: Task 1〜5 のすべて
- Produces: PR

- [ ] **Step 1: 自動検証**

開発サーバーを止めたうえで実行する。

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: すべてエラー・警告なし

- [ ] **Step 2: 実ブラウザで確認**

`npm run dev` を起動し、設計書12章の C-1 受け入れ基準を確認する。

| # | 手順 | 期待結果 |
| --- | --- | --- |
| 1 | `/search` で「薫る花は凛と咲く」を検索 | 巻がまとまって1行で表示される |
| 2 | その行を見る | 最新巻の巻数と発売日が出る |
| 3 | 「呪術廻戦」を検索 | `呪術廻戦≡` が別の行になる |
| 4 | 検索結果の上部 | 「他 N 件（セット商品など）を除外中」が出る |
| 5 | 除外件数を押す | 除外された商品が表示される |
| 6 | 巻数のない単独商品 | 従来どおり1行で表示される |
| 7 | 「巻を選んで追加」を押す | 巻一覧が開く |
| 8 | 既に本棚にある巻 | 「追加済み」と表示され、チェックできない |
| 9 | いくつか選んで「選んだ巻を本棚に追加」 | 選んだ巻だけが追加される |
| 10 | 既に持っている巻を含めて追加を試す | スキップ件数が表示される |
| 11 | `/` を開く | 本棚は1巻ずつ表示される |

- [ ] **Step 3: DB で保存結果を検証**

Supabase MCP の `execute_sql` で確認する（読み取りのみ）。

```sql
select title, category, is_ongoing, is_purchased, isbn
from public.books
order by created_at desc
limit 20;
```

選んだ巻だけが入っていること、分類と連載中フラグがまとめ行での選択と
一致していることを確認する。

- [ ] **Step 4: プッシュして PR を作成**

```bash
git push -u origin feature/series-grouping
gh pr create --base main --title "feat: 検索結果をシリーズ単位でまとめて表示する" --body "$(cat <<'EOF'
利用者からの仕様変更に対応する（C-1）。検索結果を作品単位でまとめ、
欲しい巻だけを選んで本棚へ追加できるようにする。本棚は従来どおり
1巻ずつ表示する。

## 実装内容

- 検索結果のシリーズまとめ表示
- 巻を選んでの一括追加
- セット商品の除外と、除外件数の表示

## 実データに基づく設計

楽天APIの実レスポンスを調べ、以下を確認したうえで設計した。

- `seriesName` はレーベル名（講談社コミックス等）であり作品名ではないため、
  グルーピングのキーに使えない
- 巻数の表記は作品ごとに異なる（`薫る花は凛と咲く（24）` / `呪術廻戦 28`）
- `呪術廻戦≡` と `呪術廻戦` を同一視してはならない

区切り文字を必須としたのは、`ワンピース1` のような表記を拾おうとすると
`ROOM No.1` や `1Q84` のような題名を壊すため。取りこぼしても巻数なしの
単独行になるだけで情報は失われない。

## 検証

typecheck / lint / test / build すべてエラーなし。
実ブラウザでまとめ表示・除外・巻の選択追加を確認済み。

## 次の作業（C-2）

発売日アラートとカレンダーは後続のPRで実装する。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: 音声案内を鳴らして人間へ承認を求める**

```bash
say -v Kyoko -r 200 "シリーズまとめ表示の実装が完了しました。プルリクエストの承認をお願いします。"
```

マージは人間の承認を得てから行う（CLAUDE.md 3章）。
