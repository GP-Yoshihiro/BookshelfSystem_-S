# 本棚の削除機能と購入済みのみ表示 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 本棚から書籍を削除できるようにし、本棚には購入済みの本だけを表示する。あわせて未購入での保存手段をなくす。

**Architecture:** 削除は1つの Server Action と、確認ダイアログを内蔵した1つのボタンコンポーネントで実現し、詳細ページとプレビューの両方から使う。

**Tech Stack:** Next.js 15.5 / React 19 / TypeScript strict / Tailwind CSS 3 / Vitest

**Spec:** この計画自体が仕様を兼ねる（利用者との対話で確定済み）。判断の根拠は各タスクに記載。

## 決定事項（利用者との対話で確定）

1. **本棚には購入済みの本だけを表示する**
2. **未購入での保存をやめる。** 保存しても本棚に出ない本を作れてしまうため、検索画面から「本棚に追加」（未購入）ボタンを削除し、「購入済みとして追加」のみにする
3. **削除は詳細ページとプレビューの両方から行える。** どちらも確認ダイアログを挟む
4. `is_purchased` カラムは残す。将来「欲しい本リスト」を作るときに再度マイグレーションが要るため
5. 既存の未購入7冊は、実装完了後にコントローラが DB から直接削除する

## Global Constraints

- 対話・ドキュメント・コメント・コミットメッセージはすべて日本語。コード内の識別子は英語
- TypeScript strict モード。`any` の使用は禁止（`@typescript-eslint/no-explicit-any: error`）
- `tsconfig.json` は `noUncheckedIndexedAccess` / `noUnusedLocals` / `noUnusedParameters` が有効
- **`'use server'` ファイルは async 関数以外を export できない。** 定数は `state.ts` へ置く。型は実行時に消えるため `actions.ts` 側に定義してよい
- `console.error(error)` のようにエラーオブジェクトをそのまま出力しない
- Server Action では対象の所有者確認を RLS に委ね、`user_id` をフォームから受け取らない
- パス別名 `@/*` は `./src/*` を指す
- コミット前に `npm run typecheck` / `npm run lint` / `npm test` / `npm run build` がすべてエラーなしであること
- **開発サーバーの稼働中に `npm run build` を実行しないこと。** `.next` が壊れる
- `npm install` を実行しないこと（`@vitejs/plugin-react` が 5.2.0 に固定されており壊れる）
- コミットメッセージ末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- 作業ブランチは `feature/bookshelf-delete`。`main` へのマージは人間の承認を得てから

## 既存コードの前提

```ts
// src/features/books/actions.ts（'use server'）
export interface SaveBookState { errorMessage: string; successMessage: string }
export async function saveBookAction(prev: SaveBookState, formData: FormData): Promise<SaveBookState>;

// src/features/books/state.ts
export const SAVE_BOOK_INITIAL_STATE: SaveBookState;

// src/features/books/keys.ts
export function userBooksCacheTag(userId: string): string;

// src/features/bookshelf/filters.ts
export interface BookFilters { categories: readonly BookCategory[]; publishers: readonly string[]; onlyOngoing: boolean; onlyPurchased: boolean }
export const EMPTY_FILTERS: BookFilters;
export function filterBooks(books: readonly Book[], filters: BookFilters): Book[];

// src/features/bookshelf/BookPreview.tsx
export function BookPreview({ book, onClose }: { book: Book; onClose: () => void }): JSX.Element;
```

DB には RLS ポリシー `books_delete_own`（`user_id = auth.uid()` の行のみ削除可）がある。
したがってアプリ側で所有者を確認する必要はない。

---

### Task 1: 購入済み絞り込みの削除

**Files:**
- Modify: `src/features/bookshelf/filters.ts`
- Modify: `src/features/bookshelf/filters.test.ts`
- Modify: `src/features/bookshelf/BookshelfControls.tsx`

**Interfaces:**
- Produces: `BookFilters` から `onlyPurchased` を除いた型

**判断の根拠:** 本棚に購入済みの本しか出なくなるため、「購入済み」で絞り込むボタンは
常に全件を返す無意味な操作になる。残すと利用者を混乱させる。

- [ ] **Step 1: 型と実装から `onlyPurchased` を取り除く**

`src/features/bookshelf/filters.ts`:
- `BookFilters` インターフェースから `onlyPurchased: boolean;` の行を削除
- `EMPTY_FILTERS` から `onlyPurchased: false,` の行を削除
- `filterBooks` から次のブロックを削除

```ts
    if (filters.onlyPurchased && !target.is_purchased) {
      return false;
    }
```

- [ ] **Step 2: テストを合わせる**

`src/features/bookshelf/filters.test.ts`:
- 「購入済みで絞り込む」テスト（`onlyPurchased: true` を使うもの）を**削除**する
- 「複数条件は AND で結合する」テストが `onlyPurchased` を使っているので、
  `onlyOngoing` を使う形へ書き換える

書き換え後のテスト:

```ts
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
```

- [ ] **Step 3: 操作UIから購入済みボタンを取り除く**

`src/features/bookshelf/BookshelfControls.tsx` の 148〜162 行付近にある
「購入済み」ボタンの `<button>` 要素をまるごと削除する。
`aria-pressed={filters.onlyPurchased}` を含むブロックが対象。

- [ ] **Step 4: 検証**

Run: `npm run typecheck && npm run lint && npm test`
Expected: すべてエラーなし。テストは **144件**（1件削除したため145→144）

- [ ] **Step 5: コミット**

```bash
git add src/features/bookshelf/filters.ts src/features/bookshelf/filters.test.ts src/features/bookshelf/BookshelfControls.tsx
git commit -m "$(cat <<'EOF'
refactor: 本棚の購入済み絞り込みを削除する

本棚に購入済みの本しか表示しなくなるため、購入済みで絞り込むボタンは
常に全件を返す無意味な操作になる。残すと利用者を混乱させるため取り除く。

is_purchased カラム自体は残す。将来「欲しい本リスト」を作るときに
再度マイグレーションが必要になるため。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 削除の Server Action と確認付きボタン

**Files:**
- Modify: `src/features/books/actions.ts`（`deleteBookAction` を追加）
- Modify: `src/features/books/state.ts`（初期状態を追加）
- Create: `src/features/books/DeleteBookButton.tsx`

**Interfaces:**
- Produces:
  - `interface DeleteBookState { errorMessage: string; deletedId: string }`（`actions.ts`）
  - `DELETE_BOOK_INITIAL_STATE: DeleteBookState`（`state.ts`）
  - `deleteBookAction(prevState: DeleteBookState, formData: FormData): Promise<DeleteBookState>`
  - `<DeleteBookButton bookId title redirectTo? />`

**設計の要点:** ボタンとダイアログを1つのコンポーネントにまとめ、詳細ページと
プレビューの両方から使う。同じ確認体験を2箇所に書き分けると片方だけ直す事故が起きる。

**所有者の確認は RLS に委ねる。** `books_delete_own` が `user_id = auth.uid()` の行しか
削除させないため、アプリ側で確認する必要はない。他人の本の ID を送っても0件削除になる。

- [ ] **Step 1: Server Action を追加**

`src/features/books/actions.ts` の末尾へ追加する（既存の `saveBookAction` は変更しない）:

```ts
export interface DeleteBookState {
  errorMessage: string;
  /** 削除できた書籍の ID。呼び出し側が成功を判定するために使う */
  deletedId: string;
}

/**
 * 本棚から書籍を削除する。
 *
 * 所有者の確認は RLS のポリシー books_delete_own に委ねる。
 * user_id = auth.uid() の行しか削除されないため、他人の書籍 ID を
 * 送られても0件削除になる。アプリ側で所有者を確認する必要はない。
 */
export async function deleteBookAction(
  _prevState: DeleteBookState,
  formData: FormData,
): Promise<DeleteBookState> {
  const rawId = formData.get('bookId');
  const bookId = typeof rawId === 'string' ? rawId.trim() : '';

  if (bookId.length === 0) {
    return { errorMessage: GENERIC_ERROR, deletedId: '' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    return { errorMessage: '認証が必要です。', deletedId: '' };
  }

  const { data, error } = await supabase
    .from('books')
    .delete()
    .eq('id', bookId)
    .select('id');

  if (error !== null) {
    // エラーオブジェクトは出力しない
    return { errorMessage: GENERIC_ERROR, deletedId: '' };
  }

  // 他人の書籍や存在しない ID は RLS により0件になる。
  // 「存在しない」と「他人のもの」を区別せず同じ文言にし、
  // ID の総当たりで他人の蔵書を推測できないようにする
  if (data === null || data.length === 0) {
    return { errorMessage: '削除できませんでした。', deletedId: '' };
  }

  revalidateTag(userBooksCacheTag(user.id));
  return { errorMessage: '', deletedId: bookId };
}
```

`GENERIC_ERROR` / `createClient` / `revalidateTag` / `userBooksCacheTag` は
**既存の `actions.ts` に import・定義済みかを必ず確認すること。**
無ければ import を追加する。

- [ ] **Step 2: 初期状態を追加**

`src/features/books/state.ts` の末尾へ追加する:

```ts
import type { DeleteBookState } from './actions';

/** 書籍削除フォームの初期状態 */
export const DELETE_BOOK_INITIAL_STATE: DeleteBookState = {
  errorMessage: '',
  deletedId: '',
};
```

既存の `import type { SaveBookState } from './actions';` と1行にまとめてよい。

- [ ] **Step 3: 確認付きの削除ボタンを作る**

`src/features/books/DeleteBookButton.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { deleteBookAction } from './actions';
import { DELETE_BOOK_INITIAL_STATE } from './state';
import { speakComplete, speakError } from '@/lib/speech';

/**
 * 本棚から書籍を削除するボタン。確認ダイアログを内蔵する。
 *
 * 削除すると元に戻せず、再度検索して登録し直す必要があるため、
 * 必ず確認を挟む。何を消そうとしているか分かるよう書名を示す。
 *
 * 詳細ページとプレビューの両方から使う。同じ確認体験を2箇所へ
 * 書き分けると、片方だけ直してしまう事故が起きるため1つにまとめている。
 */
export function DeleteBookButton({
  bookId,
  title,
  redirectTo,
}: {
  bookId: string;
  title: string;
  /** 削除後に移動する先。指定しなければその場で再読み込みする */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    deleteBookAction,
    DELETE_BOOK_INITIAL_STATE,
  );
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    if (state.deletedId.length > 0) {
      speakComplete('本棚から削除しました。');
      if (redirectTo === undefined) {
        router.refresh();
      } else {
        router.push(redirectTo);
      }
      return;
    }
    if (state.errorMessage.length > 0) {
      speakError();
    }
  }, [state.deletedId, state.errorMessage, redirectTo, router]);

  if (!isConfirming) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => setIsConfirming(true)}
          className="text-sm text-red-300 underline"
        >
          本棚から削除
        </button>
        {state.errorMessage.length > 0 && (
          <p role="alert" className="text-sm text-red-300">
            {state.errorMessage}
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2 rounded bg-wood-900 p-3">
      <input type="hidden" name="bookId" value={bookId} />
      <p className="text-sm text-wood-100">
        「{title}」を本棚から削除します。元に戻せません。
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setIsConfirming(false)}
          className="rounded border border-wood-400 px-3 py-1 text-sm text-wood-100"
        >
          やめる
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-red-800 px-3 py-1 text-sm font-medium text-wood-50 hover:bg-red-700 disabled:opacity-60"
        >
          {isPending ? '削除中…' : '削除する'}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: 検証**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: すべてエラーなし。テストは 144件

**build が `TypeError` で落ちた場合**、`actions.ts` から関数以外を export していないか
確認すること（`DeleteBookState` は型なので問題ない）。

- [ ] **Step 5: コミット**

```bash
git add src/features/books/actions.ts src/features/books/state.ts src/features/books/DeleteBookButton.tsx
git commit -m "$(cat <<'EOF'
feat: 本棚から書籍を削除する機能を実装

削除すると元に戻せず再度検索して登録し直す必要があるため、必ず確認を
挟む。何を消そうとしているか分かるよう書名を示す。

ボタンと確認ダイアログは1つのコンポーネントにまとめ、詳細ページと
プレビューの両方から使う。同じ確認体験を2箇所へ書き分けると片方だけ
直してしまう事故が起きるため。

所有者の確認は RLS の books_delete_own に委ねる。user_id = auth.uid() の
行しか削除されないため、他人の書籍IDを送られても0件削除になる。
その場合も「存在しない」と区別せず同じ文言にし、IDの総当たりで他人の
蔵書を推測できないようにする。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 削除の導線を組み込む

**Files:**
- Modify: `src/app/(app)/books/[id]/page.tsx`
- Modify: `src/features/bookshelf/BookPreview.tsx`

**Interfaces:**
- Consumes: `DeleteBookButton`（Task 2）

**設計の要点:** 詳細ページから削除した場合は本棚へ戻す。削除した本の詳細ページに
留まると、存在しない本を見続けることになるため。プレビューから削除した場合は
その場に留まり再読み込みする。本棚を見ながら続けて整理できるため。

- [ ] **Step 1: 詳細ページへ削除ボタンを置く**

`src/app/(app)/books/[id]/page.tsx` に import を追加する:

```tsx
import { DeleteBookButton } from '@/features/books/DeleteBookButton';
```

「楽天ブックスで見る」のリンクがあるブロックの**直後**へ、次を追加する:

```tsx
          <div className="pt-2">
            <DeleteBookButton bookId={book.id} title={book.title} redirectTo="/" />
          </div>
```

`redirectTo="/"` を渡すのは、削除した本の詳細ページに留まると存在しない本を
見続けることになるため。

- [ ] **Step 2: プレビューへ削除ボタンを置く**

`src/features/bookshelf/BookPreview.tsx` に import を追加する:

```tsx
import { DeleteBookButton } from '@/features/books/DeleteBookButton';
```

「詳細を見る」と「閉じる」が並ぶ `<div className="mt-3 flex items-center gap-3">`
のブロックの**直後**へ、次を追加する:

```tsx
      <div className="mt-3 border-t border-wood-200 pt-3">
        <DeleteBookButton bookId={book.id} title={book.title} />
      </div>
```

`redirectTo` を渡さないのは、削除後もその場に留まって本棚を見ながら続けて
整理できるようにするため。

- [ ] **Step 3: 検証**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: すべてエラーなし。テストは 144件

- [ ] **Step 4: コミット**

```bash
git add "src/app/(app)/books/[id]/page.tsx" src/features/bookshelf/BookPreview.tsx
git commit -m "$(cat <<'EOF'
feat: 詳細ページとプレビューへ削除の導線を追加

詳細ページから削除した場合は本棚へ戻す。削除した本の詳細ページに留まると
存在しない本を見続けることになるため。

プレビューから削除した場合はその場に留まり再読み込みする。本棚を見ながら
続けて整理できるようにするため。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 購入済みのみの表示と、未購入での保存の廃止

**Files:**
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/features/rakuten/SaveBookForm.tsx`
- Modify: `src/features/rakuten/SeriesRow.tsx`

**設計の要点:** 未購入で保存できる手段を残すと、保存しても本棚に出ない本を
作れてしまう。利用者から見て「追加したのに消えた」という状態になるため、
保存側の入口も同時に塞ぐ。

- [ ] **Step 1: 本棚を購入済みのみにする**

`src/app/(app)/page.tsx` の `const books = ...` の行を次へ置き換える:

```tsx
  // 本棚には購入済みの本だけを並べる。未購入の本は本棚に出さない方針のため、
  // 検索画面からも未購入での保存はできないようにしている
  const allBooks = user === null ? [] : await getUserBooks(user.id);
  const books = allBooks.filter((book) => book.is_purchased);
```

- [ ] **Step 2: 単独商品の未購入ボタンを削除する**

`src/features/rakuten/SaveBookForm.tsx` から、**「本棚に追加」ボタン**
（`name="isPurchased" value="false"` を持つ `<button>`）をまるごと削除する。

残る「購入済みとして追加」ボタンはそのままにする。削除後、ボタンが1つだけに
なるため、それを包む `<div className="flex gap-2">` はそのままでよい。

- [ ] **Step 3: シリーズ行の未購入ボタンを削除する**

`src/features/rakuten/SeriesRow.tsx` から、**「選んだ巻を本棚に追加」ボタン**
（`name="isPurchased" value="false"` を持つ `<button>`）をまるごと削除する。

残る「選んだ巻を購入済みとして追加」ボタンはそのままにする。

- [ ] **Step 4: 未使用になった import や変数がないか確認する**

`noUnusedLocals` が有効なため、ボタン削除で使われなくなった変数があると
typecheck が落ちる。落ちた場合はその変数も削除すること。

- [ ] **Step 5: 検証**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: すべてエラーなし。テストは 144件

- [ ] **Step 6: コミット**

```bash
git add "src/app/(app)/page.tsx" src/features/rakuten/SaveBookForm.tsx src/features/rakuten/SeriesRow.tsx
git commit -m "$(cat <<'EOF'
feat: 本棚を購入済みのみの表示にし、未購入での保存をやめる

本棚には購入済みの本だけを並べる。あわせて検索画面から未購入で保存する
ボタンを削除した。

未購入で保存できる手段を残すと、保存しても本棚に出ない本を作れてしまう。
利用者から見て「追加したのに消えた」という状態になるため、保存側の入口も
同時に塞ぐ必要がある。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 受け入れ確認と PR 作成

**Files:** 変更なし（検証のみ）

**前提:** 既存の未購入7冊は本タスクの時点で本棚から見えなくなる。これは想定どおりで、
実装完了後にコントローラが DB から直接削除する。**欠陥として報告しないこと。**

- [ ] **Step 1: 自動検証**

開発サーバーを止めたうえで実行する。

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: すべてエラー・警告なし。テストは 144件

- [ ] **Step 2: 実ブラウザで確認**

`npm run dev` を起動して確認する。

| # | 手順 | 期待結果 |
| --- | --- | --- |
| 1 | `/` を開く | 購入済みの本だけが並ぶ。未購入の本が出ない |
| 2 | 絞り込みのタグを見る | 「購入済み」ボタンが無い |
| 3 | 本にホバーしてプレビューを出す | 「本棚から削除」が表示される |
| 4 | 「本棚から削除」を押す | 書名入りの確認が出る。まだ削除されない |
| 5 | 「やめる」を押す | 確認が閉じ、削除されない |
| 6 | もう一度押して「削除する」 | 本棚から消え、音声案内が鳴る |
| 7 | 本の詳細ページを開く | 「本棚から削除」が表示される |
| 8 | 詳細ページで削除する | 本棚（`/`）へ戻る |
| 9 | `/search` で検索する | 「本棚に追加」（未購入）ボタンが無く、「購入済みとして追加」のみ |
| 10 | まとめ行を展開する | 「選んだ巻を本棚に追加」が無く、「選んだ巻を購入済みとして追加」のみ |
| 11 | 巻を選んで追加する | 購入済みとして保存され、本棚に出る |

- [ ] **Step 3: DB で削除が反映されたか確認する**

Supabase MCP の `execute_sql` で、削除した書籍が消えていることを確認する。

```sql
select count(*) as 蔵書, count(*) filter (where is_purchased) as 購入済み
from public.books;
```

- [ ] **Step 4: プッシュして PR を作成**

```bash
git push -u origin feature/bookshelf-delete
gh pr create --base main --title "feat: 本棚の削除機能を追加し、購入済みのみの表示にする" --body "$(cat <<'EOF'
利用者からの要望に対応する。本棚から書籍を削除できるようにし、本棚には
購入済みの本だけを表示する。

## 実装内容

- 書籍の削除（詳細ページとプレビューの両方から。確認ダイアログ付き）
- 本棚を購入済みのみの表示に変更
- 検索画面から未購入での保存手段を削除
- 本棚の「購入済み」絞り込みを削除

## 判断した点

**未購入での保存もやめた。** 保存できる手段を残すと、保存しても本棚に
出ない本を作れてしまう。利用者から見て「追加したのに消えた」という状態に
なるため、保存側の入口も同時に塞いだ。

**削除は必ず確認を挟む。** 元に戻せず、再度検索して登録し直す必要があるため。
確認には書名を示し、何を消そうとしているかが分かるようにした。

**ボタンと確認は1つのコンポーネントにまとめた。** 同じ確認体験を詳細ページと
プレビューへ書き分けると、片方だけ直してしまう事故が起きるため。

**所有者の確認は RLS に委ねた。** books_delete_own が user_id = auth.uid() の
行しか削除させないため。他人の書籍IDを送られても0件削除になり、その場合も
「存在しない」と区別せず同じ文言にして、IDの総当たりで他人の蔵書を推測
できないようにしている。

**is_purchased カラムは残した。** 将来「欲しい本リスト」を作るときに再度
マイグレーションが必要になるため。

## 検証

typecheck / lint / test（144件）/ build すべてエラーなし。
実ブラウザで削除の確認・取り消し・実行、購入済みのみの表示、検索画面からの
未購入ボタンの消失を確認済み。

## マージ後の作業

既存の未購入7冊（発売前の巻や誤登録の特装版）は本棚から見えなくなるため、
DB から直接削除する。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: 音声案内を鳴らして人間へ承認を求める**

```bash
say -v Kyoko -r 200 "削除機能の実装が完了しました。プルリクエストの承認をお願いします。"
```

マージは人間の承認を得てから行う（CLAUDE.md 3章）。
