# 工程C-2 発売日アラートとカレンダー 実装計画

対象設計書: `docs/superpowers/specs/2026-09-18-series-and-alerts-design.md` の 9〜12 章
ブランチ: `feature/release-alerts`
起点: `d2abeed`（テーブル `release_alerts` 追加、`calendar_reservations` 削除、型定義更新まで完了済み）

## 前提（着手前に確定済みのこと）

- `release_alerts` テーブルは **適用済み**。RLS も有効。Supabase advisor に新規警告なし
- `calendar_reservations` は **削除済み**。`src/types/database.ts` も更新済み
- 「発売日を通知」は **シリーズ（複数巻がまとまった行）にのみ出す**（利用者の選択）
- 通知対象は **最新巻のみ**（設計書 9 章）
- 発売日の通知と本棚は **完全に独立**。アラートを登録しても本棚には何も追加しない

## 全体像

| # | 内容 | 主な成果物 |
| --- | --- | --- |
| 1 | 月グリッドの純粋関数 | `alerts/calendar.ts` + テスト |
| 2 | アラートの取得キャッシュと登録・解除 | `alerts/keys.ts` `alerts/cache.ts` `alerts/actions.ts` `alerts/state.ts` |
| 3 | 検索画面の「発売日を通知」ボタン | `AlertButton.tsx`、`SeriesRow.tsx` / `SearchResults.tsx` / `search/page.tsx` |
| 4 | カレンダー画面 | `app/(app)/calendar/page.tsx`、`CalendarView.tsx`、`AlertList.tsx`、ナビ追加 |
| 5 | 古いアラートの自動更新 | `alerts/refresh.ts`、`StaleAlertRefresher.tsx` |
| 6 | 受け入れ確認と PR | — |

---

## Task 1: 月グリッドの純粋関数

**Files:**
- Create: `src/features/alerts/calendar.ts`
- Create: `src/features/alerts/calendar.test.ts`

**Interfaces:**
- Produces:
  - `interface MonthGridCell { date: string; day: number; isCurrentMonth: boolean }`
  - `buildMonthGrid(year: number, month: number): MonthGridCell[][]`
  - `addMonths(year: number, month: number, diff: number): { year: number; month: number }`
  - `formatMonthLabel(year: number, month: number): string`
  - `toDateKey(date: Date): string`

**判断の根拠:** 日付計算は境界（月初の曜日、月末の埋め、うるう年、年またぎ）を
間違えやすく、画面と混ぜると壊れても気づけない。純粋関数へ切り出してテストで固定する。

**`month` は 1〜12** とする。JavaScript の `Date` が 0 始まりなのは呼び出し側から
見て不自然で、取り違えの原因になるため、この層で吸収する。

- [ ] **Step 1: 実装**

```ts
/**
 * カレンダー描画のための日付計算。
 *
 * month は 1〜12 で扱う。Date が 0 始まりなのは呼び出し側から見て不自然で、
 * 取り違えの原因になるため、この層で吸収する。
 *
 * 日付は UTC で組み立てる。ローカルタイムゾーンで組み立てると、
 * 実行環境によって日がずれることがあるため。
 */

export interface MonthGridCell {
  /** ISO 8601 の日付 (YYYY-MM-DD) */
  date: string;
  day: number;
  /** その月の日か。前後の月から埋めたセルは false */
  isCurrentMonth: boolean;
}

/** Date を YYYY-MM-DD へ変換する（UTC 基準） */
export function toDateKey(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 月を移動する。12月の翌月は翌年1月になる */
export function addMonths(
  year: number,
  month: number,
  diff: number,
): { year: number; month: number } {
  // 0 始まりへ直してから足し、あふれた分を年へ繰り上げる
  const zeroBased = month - 1 + diff;
  return {
    year: year + Math.floor(zeroBased / 12),
    month: ((zeroBased % 12) + 12) % 12 + 1,
  };
}

export function formatMonthLabel(year: number, month: number): string {
  return `${year}年${month}月`;
}

/**
 * 日〜土の7列からなる週の配列を返す。
 * 月初の前と月末の後は、前後の月の日で埋める（グリッドの形を崩さないため）。
 */
export function buildMonthGrid(year: number, month: number): MonthGridCell[][] {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  // 週は日曜始まり。月初が何曜日かの分だけ前へ戻す
  const start = new Date(firstOfMonth);
  start.setUTCDate(start.getUTCDate() - firstOfMonth.getUTCDay());

  const weeks: MonthGridCell[][] = [];
  const cursor = new Date(start);

  // 最大6週。月末を含む週まで作って止める
  for (let week = 0; week < 6; week += 1) {
    const cells: MonthGridCell[] = [];
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      cells.push({
        date: toDateKey(cursor),
        day: cursor.getUTCDate(),
        isCurrentMonth: cursor.getUTCMonth() === month - 1,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(cells);

    // 次の週がすべて翌月なら、そこで打ち切る（空の行を作らない）
    if (cursor.getUTCMonth() !== month - 1) {
      break;
    }
  }

  return weeks;
}
```

- [ ] **Step 2: テスト**

`src/features/alerts/calendar.test.ts` に **9件**:

```ts
describe('addMonths', () => {
  it('同じ年の中で月を進める', ...)          // 2026/3 +2 → 2026/5
  it('12月の翌月は翌年1月になる', ...)       // 2026/12 +1 → 2027/1
  it('1月の前月は前年12月になる', ...)       // 2026/1 -1 → 2025/12
  it('12か月以上の移動でも年が正しく動く', ...) // 2026/5 -17 → 2024/12
});

describe('buildMonthGrid', () => {
  it('週は日曜で始まり土曜で終わる', ...)
  it('月初の前は前月の日で埋める', ...)       // 2026年9月1日は火曜 → 先頭2セルは8月30,31
  it('最終週の月末より後は翌月の日で埋める', ...)
  it('うるう年の2月は29日まである', ...)      // 2024年2月に 2024-02-29 が含まれ isCurrentMonth
  it('平年の2月に29日は現れない', ...)        // 2026年2月の isCurrentMonth なセルは28件
});
```

**テストの書き方の注意:** `isCurrentMonth` が true のセルだけを取り出して
日数を数えること。グリッド全体の長さ（35 や 42）を検証しても、埋めセルの
月が違っていれば気づけない。

- [ ] **Step 3: 検証**

`npm run typecheck && npm run lint && npm test`
テストは **153件**（144 + 9）。**`npm run build` は実行しない**（開発サーバーが
動いている場合に `.next` が壊れるため。ビルド確認は Task 6 でまとめて行う）。

- [ ] **Step 4: コミット**

```
feat: カレンダーの月グリッドを組み立てる純粋関数を追加
```

---

## Task 2: アラートの取得キャッシュと登録・解除

**Files:**
- Create: `src/features/alerts/keys.ts`
- Create: `src/features/alerts/keys.test.ts`
- Create: `src/features/alerts/cache.ts`
- Create: `src/features/alerts/actions.ts`
- Create: `src/features/alerts/state.ts`

**Interfaces:**
- Produces:
  - `userAlertsCacheKey(userId): string[]` / `userAlertsCacheTag(userId): string`
  - `getUserAlerts(userId): Promise<ReleaseAlert[]>`
  - `interface AlertActionState { errorMessage: string; successMessage: string }`
  - `createAlertAction(prev, formData)` / `deleteAlertAction(prev, formData)`
  - `ALERT_ACTION_INITIAL_STATE`

**★安全上きわめて重要★** `getUserAlerts` は `unstable_cache` の内側で `cookies()` を
読めないため、RLS を迂回する管理者クライアントを使う。`src/features/books/cache.ts`
と同じ構造にし、同じ警告コメントを置くこと。呼び出し側は必ず
`supabase.auth.getUser()` 由来の userId を渡す（設計書 8.1 の規則1）。

- [ ] **Step 1: キャッシュキー**

`keys.ts` は `src/features/books/keys.ts` と同じ形にする:

```ts
export function userAlertsCacheKey(userId: string): string[] {
  return ['user-alerts', userId];
}

export function userAlertsCacheTag(userId: string): string {
  return `alerts:${userId}`;
}
```

`keys.test.ts` に **2件**: userId がキーに含まれること、
利用者が違えばタグが異なること。

- [ ] **Step 2: 取得キャッシュ**

`cache.ts` は `src/features/books/cache.ts` を実際に開いて、同じ構造・同じ
コメントの書き方に揃えること。相違点は次の3つだけ:

- テーブル名 `release_alerts`
- 並び順 `.order('latest_release_date', { ascending: true, nullsFirst: false })`
  — カレンダーは発売日順に読むため。発売日が未確定のものは末尾へ
- 戻り値の型 `ReleaseAlert[]`

管理者クライアントを使うため `.eq('user_id', userId)` を必ず書く
（設計書 8.1 の規則3。落とすと全利用者のアラートが返る）。

- [ ] **Step 3: 登録・解除の Server Action**

`actions.ts`（`'use server'`）。定数は `state.ts` へ置く（`'use server'` ファイルは
関数以外を export できない。過去に2度この制約でビルドが壊れている）。

`createAlertAction` の要点:

- `series_key` / `series_title` / `latest_title` / `latest_isbn` は必須。空なら失敗
- `latest_volume` は数値化できなければ `null`
- `latest_release_date` は `YYYY-MM-DD` 形式のときだけ採用し、それ以外は `null`。
  **曖昧な表記を勝手に日付へ変換しない**（実在しない予定を作るため。0006 の判断と同じ）
- `latest_release_date_text` に原文を入れる
- `user_id` は **フォームからではなく** `supabase.auth.getUser()` から取る
- `upsert(..., { onConflict: 'user_id,series_key' })` で、既に登録済みなら最新情報へ更新する。
  重複を失敗として扱わない（利用者から見れば「通知中」のまま情報が新しくなるだけ）
- 成功したら `revalidateTag(userAlertsCacheTag(user.id))`
- エラーオブジェクトはログにも戻り値にも出さない

`deleteAlertAction` の要点:

- `alertId` を受け取り、`.delete().eq('id', alertId).select('id')`
- 所有者の確認は RLS の `release_alerts_delete_own` に委ねる。0件なら
  「解除できませんでした。」を返し、「存在しない」と「他人のもの」を区別しない
- 成功したら `revalidateTag(userAlertsCacheTag(user.id))`

`state.ts`:

```ts
import type { AlertActionState } from './actions';

/** 発売日アラートの操作フォームの初期状態 */
export const ALERT_ACTION_INITIAL_STATE: AlertActionState = {
  errorMessage: '',
  successMessage: '',
};
```

- [ ] **Step 4: 検証**

`npm run typecheck && npm run lint && npm test`
テストは **155件**（153 + 2）。**build は実行しない**。

- [ ] **Step 5: コミット**

```
feat: 発売日アラートの取得・登録・解除を実装
```

---

## Task 3: 検索画面の「発売日を通知」ボタン

**Files:**
- Create: `src/features/alerts/AlertButton.tsx`
- Modify: `src/features/rakuten/SeriesRow.tsx`
- Modify: `src/features/rakuten/SearchResults.tsx`
- Modify: `src/app/(app)/search/page.tsx`

**Interfaces:**
- Consumes: `createAlertAction` / `deleteAlertAction`（Task 2）、`SeriesGroup`
- Produces: `<AlertButton group alertId={string | null} />`

**設計の要点:** **アラートを登録しても本棚には何も追加しない。** 利用者が明示した
とおり、発売日の通知と本棚は別物である。したがってこのボタンは `saveBooksAction` を
一切呼ばない。

**ボタンはシリーズ（`isSingle` が false の行）にのみ出す。** 単独商品は続きが
出ないため、最新巻を追い続けるという通知の意味がない。

- [ ] **Step 1: 登録済み series_key を画面まで運ぶ**

`src/app/(app)/search/page.tsx` で、既に本棚の ISBN を読んでいるのと同じ要領で
アラートも読む。`getUserAlerts(user.id)` を呼び、`series_key → id` の対応を作って
`SearchResults` へ渡す。

**必ず `supabase.auth.getUser()` の戻り値を使うこと**（props やクエリから
受け取った id を渡してはならない）。

`SearchResults` は受け取った対応表を `SeriesRow` へそのまま渡す。

型は `ReadonlyMap<string, string>`（series_key → alertId）とする。
`Set` ではなく `Map` にするのは、解除するときに alertId が要るため。

- [ ] **Step 2: ボタン本体**

`AlertButton.tsx`（`'use client'`）。状態は2つだけ:

- 未登録 → 「発売日を通知」。押すと `createAlertAction` へ送る
- 登録済み → 「通知中（解除）」。押すと `deleteAlertAction` へ送る

送る値は hidden input で固定する（submit ボタンの name/value に頼らない。
submitter を伴わない送信で値が欠ける壊れ方をするため。工程C-1の修正と同じ判断）。

送る項目は `group.latest` から取る。`group.latest` が `null`（巻数を持つ商品が
無い）のときは **ボタンを出さない**。最新巻を特定できないため。

**`series_key` には必ず `group.key` を送ること。** ここで独自にキーを作り直すと、
Task 5 の更新処理が検索結果から同じ作品を見つけられなくなる。`series_title` には
`group.title` を送る。

発売日は `parseSalesDate(group.latest.item.salesDate)` の結果を使い、
`date` を `latest_release_date`、`text` を `latest_release_date_text` に入れる。

処理完了時に `speakComplete()`、失敗時に `speakError()` を呼ぶ（CLAUDE.md 5章）。

- [ ] **Step 3: SeriesRow へ差し込む**

「巻を選んで追加」ボタンと並ぶ位置へ置く。`group.isSingle` が true のときと
`group.latest === null` のときは出さない。

- [ ] **Step 4: 検証**

`npm run typecheck && npm run lint && npm test`（**build は実行しない**）。
テストは 155件のまま（UIの追加でテストは増えない）。

- [ ] **Step 5: コミット**

```
feat: 検索結果から発売日アラートを登録・解除できるようにする
```

---

## Task 4: カレンダー画面

**Files:**
- Create: `src/app/(app)/calendar/page.tsx`
- Create: `src/features/alerts/CalendarView.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `getUserAlerts`、`buildMonthGrid` / `addMonths` / `formatMonthLabel`、`deleteAlertAction`

**設計の要点:** 月の移動はクライアント側の状態で行う。アラートは全件を先に
読んでおり、月を変えるたびにサーバーへ行く理由がないため。

- [ ] **Step 1: ページ**

`src/app/(app)/calendar/page.tsx`（Server Component）:

- `export const dynamic = 'force-dynamic';`
- `supabase.auth.getUser()` → `getUserAlerts(user.id)`
- `<CalendarView alerts={alerts} />` を描画

- [ ] **Step 2: カレンダー本体**

`CalendarView.tsx`（`'use client'`）:

- 表示中の年月を `useState` で持つ。初期値は今日の年月
- `buildMonthGrid` で週の配列を作り、日〜土の見出し付きで並べる
- `latest_release_date` をキーにした `Map<string, ReleaseAlert[]>` を作り、
  その日に発売があるセルへマーカーを出す
- 月の移動は「前月」「翌月」ボタン。`addMonths` を使う
- 下部にリスト。**これから発売を先頭に、過去は下へ**。
  発売日が未確定（`latest_release_date` が null）のものは「発売日未定」として
  最後にまとめ、`latest_release_date_text` があればその原文を出す
- 各行に解除ボタン（`deleteAlertAction`）。**解除には確認を挟む**
  （元に戻すには検索し直す必要があるため。削除機能と同じ判断）
- 追加ボタンは `/search` へのリンクにする（設計書 9.3、利用者の選択）
- アラートが0件のときは、`/search` から登録できる旨を案内する

「今日」の判定はクライアント側で行う。サーバーで判定すると、
キャッシュされた時刻で固定されてしまうため。

**ただし `toDateKey(new Date())` で今日のキーを作ってはならない。** `toDateKey` は
UTC 基準のため、日本時間の朝（UTC では前日の夜）に前日が「今日」と表示される。
今日のキーは `getFullYear()` / `getMonth()` / `getDate()`（ローカル）から
組み立てること。グリッドの各セルは日付の「ラベル」であってタイムスタンプでは
ないため、UTC で組み立てたキーと文字列として突き合わせて問題ない。

同じ理由で、初期表示の年月もローカルの `getFullYear()` / `getMonth() + 1` から取る。

- [ ] **Step 3: ナビゲーションへ追加**

`src/app/(app)/layout.tsx` の `<nav>` に「カレンダー」を `/calendar` へのリンクとして
追加する。「本を探す」の前後どちらでもよいが、既存のリンクと同じ書き方に揃えること。

- [ ] **Step 4: 検証**

`npm run typecheck && npm run lint && npm test`（**build は実行しない**）。

- [ ] **Step 5: コミット**

```
feat: 発売日カレンダーの画面を追加
```

---

## Task 5: 古いアラートの自動更新

**Files:**
- Create: `src/features/alerts/refresh.ts`
- Create: `src/features/alerts/StaleAlertRefresher.tsx`
- Modify: `src/app/(app)/calendar/page.tsx`

**Interfaces:**
- Produces: `refreshStaleAlertsAction(): Promise<{ updated: number }>`

**設計の要点（設計書 9.2）:** **Server Component の描画中に更新してはならない。**
描画は副作用を持つべきでなく、同じページを複数タブで開いたときに重複して走る。
クライアント側の Client Component が mount 時に Server Action を呼び、
完了後に `router.refresh()` する。

- [ ] **Step 1: 更新処理**

`refresh.ts`（`'use server'`）:

- `STALE_AFTER_MS = 24 * 60 * 60 * 1000`（24時間）を **`refresh.ts` の外**、
  つまり `src/features/alerts/state.ts` へ置く（`'use server'` は定数を export できない）
- 認証済み利用者のアラートのうち、`checked_at` が 24 時間以上前のものを取る
- 各作品について `getCachedRakutenSearch(series_title, 1)` で検索し、
  `splitExcluded` → `groupBySeries` → 同じ `series_key` の group を選ぶ
- その group の `latest` が今より新しい巻であれば、最新巻の情報で更新する。
  新しくなくても `checked_at` は必ず更新する（次に開いたとき再度問い合わせないため）
- **1回の実行で更新するのは最大 5 件まで** とする。楽天への呼び出しが一気に
  増えると QPS 制限に触れるため。残りは次に開いたときに処理される
- 失敗した作品は飛ばし、他の作品の更新を止めない
- 1件でも更新したら `revalidateTag(userAlertsCacheTag(user.id))`
- エラーオブジェクトは出力しない

- [ ] **Step 2: 呼び出し側**

`StaleAlertRefresher.tsx`（`'use client'`）:

- mount 時に一度だけ `refreshStaleAlertsAction()` を呼ぶ。
  `useRef` で二重実行を防ぐ（開発時の StrictMode で2回走るため）
- 戻り値の `updated` が 1 以上なら `router.refresh()`
- 画面には何も出さない（`return null`）。更新は利用者の操作ではないため、
  完了の音声案内も出さない（CLAUDE.md 5章の「主要な処理」に当たらない）

`calendar/page.tsx` で `<StaleAlertRefresher />` を描画する。

- [ ] **Step 3: 検証**

`npm run typecheck && npm run lint && npm test`（**build は実行しない**）。

- [ ] **Step 4: コミット**

```
feat: 24時間以上前に確認した発売日アラートを自動で更新する
```

---

## Task 6: 受け入れ確認と PR

**Files:** 変更なし（検証のみ）

- [ ] **Step 1: 自動検証**

開発サーバーを止め、`.next` を削除してから:

`npm run typecheck && npm run lint && npm test && npm run build`
すべてエラー・警告なし。テストは **155件**。

- [ ] **Step 2: 実ブラウザで確認（設計書 12章の受け入れ基準 11〜16）**

| # | 手順 | 期待結果 |
| --- | --- | --- |
| 11 | `/search` で「転生したらスライムだった件」を検索し「発売日を通知」を押す | 登録され、`/calendar` に最新巻の発売日が載る |
| 12 | 直後に `/` を開く | **本棚に何も増えていない** |
| 13 | `/calendar` で同じ作品を解除する | 確認のうえ消える |
| 14 | `checked_at` を SQL で 2日前に戻し `/calendar` を開き直す | `checked_at` が今に更新される |
| 15 | 単独商品の行を見る | 「発売日を通知」ボタンが無い |
| 16 | Supabase の security advisor を確認 | 新規の WARN が増えていない |

月の移動、発売日未定の扱い、0件のときの案内も併せて確認する。

**確認の注意:** ブラウザペインで座標を指定して押すときは、対象要素の
`getBoundingClientRect()` を実測してから座標を出すこと。スクロール位置の
ずれで別の要素を押し、アプリの不具合と誤認する事故が実際に起きている。

- [ ] **Step 3: プッシュして PR を作成し、承認を求める**

マージは人間の承認を得てから行う（CLAUDE.md 3章）。
音声案内で承認を促す。

---

## この計画で意図的にやらないこと

- **メール・プッシュ通知**（設計書 4 章）。SMTP が未整備のため、画面への反映までとする
- **単独商品へのアラート**。続きが出ないため通知の意味がなく、利用者も
  「シリーズのみ」を選択している
- **定期実行での更新**。Vercel Cron を使う手もあるが、利用者が1人の私的利用であり、
  カレンダーを開いたときの更新で足りる
