# 認証 & 招待コード機能 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 招待制のサインアップ・ログイン・ルート保護・招待コード管理（再認証付き）を実装する。

**Architecture:** Next.js 15 App Router の Route Group で未認証向け `(auth)` と認証必須 `(app)` を分ける。ログイン・サインアップは Server Action で Supabase Auth を呼び、セッション Cookie をサーバー側から設定する。再認証だけは `persistSession:false` の使い捨てクライアントでブラウザ内完結させ、現在のセッションに影響を与えない。

**Tech Stack:** Next.js 15.5 / React 19 / TypeScript strict / Tailwind CSS 3 / @supabase/ssr 0.12 / Vitest / @testing-library/react

**Spec:** `docs/superpowers/specs/2026-09-10-auth-invite-design.md`

## Global Constraints

- 対話・ドキュメント・コミットメッセージ・PR 説明文はすべて日本語（CLAUDE.md 1章）。コード内の識別子は英語
- TypeScript strict モード。`any` の使用は禁止（CLAUDE.md 7章、`@typescript-eslint/no-explicit-any: error`）
- `tsconfig.json` は `noUncheckedIndexedAccess` / `noUnusedLocals` / `noUnusedParameters` が有効。配列アクセスの結果は `T | undefined` になる
- 機密情報をコードへ直書きしない。環境変数の読み出しは `src/lib/env.ts` に集約済み（CLAUDE.md 2章）
- `console.error(error)` のようにエラーオブジェクトをそのまま出力してはならない。表示用の日本語文言へ変換した文字列のみを扱う
- パスワードをログ・エラーメッセージ・`revalidatePath` の引数へ含めてはならない
- コミット・プッシュ前に `npm run typecheck` / `npm run lint` / `npm run build` / `npm run test` がすべてエラーなしであること（CLAUDE.md 3章）
- 音声案内は `src/lib/speech.ts` の既存関数を使う。新規実装は不要（CLAUDE.md 5章）
- パスの別名 `@/*` は `./src/*` を指す
- 作業ブランチは `feature/auth-invite`。`main` へのマージは人間の承認を得てから行う

## 事前準備（実装開始前に人間が行う）

Supabase ダッシュボードで以下を設定する。コードからは変更できない。

1. https://supabase.com/dashboard/project/qhpzasgiayhmbfiynyzu/auth/providers を開く
2. Email プロバイダを開き、**Confirm email を OFF** にして保存
3. Authentication → URL Configuration で Site URL が `http://localhost:3000` であることを確認

この設定がされていない場合、Task 10 の受け入れ確認でサインアップ後に自動ログインされず失敗する。

## ファイル構成

| ファイル | 責務 |
| --- | --- |
| `vitest.config.ts` | Vitest 設定。jsdom 環境とパス別名 |
| `vitest.setup.ts` | @testing-library/jest-dom の読み込み |
| `src/features/auth/messages.ts` | Supabase エラー → 日本語文言の変換（純粋関数） |
| `src/features/auth/actions.ts` | Server Actions: signIn / signUp / signOut |
| `src/features/auth/ReauthProvider.tsx` | 再認証の有効期限を保持する Context |
| `src/features/auth/useReauth.ts` | `requireReauth()` を提供するフック |
| `src/features/auth/ReauthDialog.tsx` | 再認証ダイアログ UI |
| `src/features/auth/LoginForm.tsx` | ログインフォーム |
| `src/features/auth/SignupForm.tsx` | サインアップフォーム |
| `src/features/invites/format.ts` | 有効期限の整形・期限切れ判定（純粋関数） |
| `src/features/invites/actions.ts` | Server Actions: 招待コードの発行・削除 |
| `src/features/invites/InviteCodeList.tsx` | 招待コード一覧（コピー・削除） |
| `src/features/invites/GenerateInviteButton.tsx` | 発行ボタンと期限選択 |
| `src/lib/supabase/verify.ts` | パスワード検証専用の使い捨てクライアント |
| `src/app/(auth)/layout.tsx` | 未認証向けレイアウト |
| `src/app/(auth)/login/page.tsx` | ログイン画面 |
| `src/app/(auth)/signup/page.tsx` | サインアップ画面 |
| `src/app/(app)/layout.tsx` | 認証必須レイアウト。ヘッダーと ReauthProvider |
| `src/app/(app)/page.tsx` | 本棚（既存 `src/app/page.tsx` を移設） |
| `src/app/(app)/settings/invites/page.tsx` | 招待コード管理画面 |
| `src/lib/supabase/middleware.ts` | 既存を拡張しルート保護を追加 |
| `src/types/database.ts` | `validate_invite_code` の型を追加 |
| `supabase/migrations/0003_add_validate_invite_code.sql` | 事前検証 RPC |

---

### Task 1: Vitest の導入とエラー文言変換

**Files:**
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `src/features/auth/messages.ts`
- Test: `src/features/auth/messages.test.ts`
- Modify: `package.json`（scripts と devDependencies）
- Modify: `eslint.config.mjs`（ignores にカバレッジ出力を追加）

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces:
  - `toAuthErrorMessage(error: unknown): string`
  - `toSignUpErrorMessage(error: unknown): string`
  - `INVITE_CODE_MESSAGES: Readonly<Record<InviteCodeStatus, string>>`
  - `type InviteCodeStatus = 'ok' | 'not_found' | 'used' | 'expired'`

- [ ] **Step 1: テスト環境の依存関係を導入**

```bash
npm install -D vitest@3 @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Vitest の設定ファイルを作成**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
```

`vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: package.json に test スクリプトを追加**

`scripts` に以下の 2 行を追加する（既存の行は変更しない）:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: 失敗するテストを書く**

`src/features/auth/messages.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  toAuthErrorMessage,
  toSignUpErrorMessage,
  INVITE_CODE_MESSAGES,
} from './messages';

describe('toAuthErrorMessage', () => {
  it('認証情報の誤りを統一文言へ変換する', () => {
    const error = { message: 'Invalid login credentials' };
    expect(toAuthErrorMessage(error)).toBe(
      'メールアドレスまたはパスワードが正しくありません。',
    );
  });

  it('ユーザーが存在しない場合も同じ文言にしてアカウント列挙を防ぐ', () => {
    const error = { message: 'User not found' };
    expect(toAuthErrorMessage(error)).toBe(
      'メールアドレスまたはパスワードが正しくありません。',
    );
  });

  it('想定外のエラーは汎用文言へ変換する', () => {
    expect(toAuthErrorMessage(new Error('network timeout'))).toBe(
      '処理に失敗しました。時間をおいて再度お試しください。',
    );
  });

  it('null や undefined でも例外を投げない', () => {
    expect(toAuthErrorMessage(null)).toBe(
      '処理に失敗しました。時間をおいて再度お試しください。',
    );
  });

  it('元のエラー文字列を含めない', () => {
    const message = toAuthErrorMessage({ message: 'secret-token-abc123' });
    expect(message).not.toContain('secret-token-abc123');
  });
});

describe('toSignUpErrorMessage', () => {
  it('登録済みメールアドレスを専用文言へ変換する', () => {
    const error = { message: 'User already registered' };
    expect(toSignUpErrorMessage(error)).toBe(
      'このメールアドレスは既に登録されています。',
    );
  });

  it('パスワードが短い場合を専用文言へ変換する', () => {
    const error = { message: 'Password should be at least 6 characters' };
    expect(toSignUpErrorMessage(error)).toBe(
      'パスワードは8文字以上で入力してください。',
    );
  });

  it('トリガ由来の 500 を招待コードの案内へ変換する', () => {
    const error = { message: 'Database error saving new user' };
    expect(toSignUpErrorMessage(error)).toBe(
      '登録に失敗しました。招待コードをご確認のうえ、もう一度お試しください。',
    );
  });

  it('想定外のエラーは汎用文言へ変換する', () => {
    expect(toSignUpErrorMessage({ message: 'something odd' })).toBe(
      '処理に失敗しました。時間をおいて再度お試しください。',
    );
  });
});

describe('INVITE_CODE_MESSAGES', () => {
  it('各状態に対応する日本語文言を持つ', () => {
    expect(INVITE_CODE_MESSAGES.not_found).toBe(
      '招待コードが正しくありません。',
    );
    expect(INVITE_CODE_MESSAGES.used).toBe(
      'この招待コードは既に使用されています。',
    );
    expect(INVITE_CODE_MESSAGES.expired).toBe(
      'この招待コードは有効期限が切れています。',
    );
    expect(INVITE_CODE_MESSAGES.ok).toBe('');
  });
});
```

- [ ] **Step 5: テストを実行して失敗を確認**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./messages"`

- [ ] **Step 6: 最小限の実装を書く**

`src/features/auth/messages.ts`:

```ts
/**
 * Supabase のエラーを利用者向けの日本語文言へ変換する純粋関数群。
 *
 * エラーオブジェクトの内容には入力値やトークンの断片が含まれ得るため、
 * ここで変換した文言のみを画面表示・ログの対象とする（CLAUDE.md 2章）。
 */

/** validate_invite_code RPC が返す状態 */
export type InviteCodeStatus = 'ok' | 'not_found' | 'used' | 'expired';

export const INVITE_CODE_MESSAGES: Readonly<Record<InviteCodeStatus, string>> =
  {
    ok: '',
    not_found: '招待コードが正しくありません。',
    used: 'この招待コードは既に使用されています。',
    expired: 'この招待コードは有効期限が切れています。',
  };

const GENERIC_MESSAGE = '処理に失敗しました。時間をおいて再度お試しください。';

/** エラーらしきオブジェクトから message プロパティを安全に取り出す */
function extractMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message: unknown };
    if (typeof message === 'string') {
      return message;
    }
  }
  return '';
}

/**
 * ログイン失敗の文言。
 * 原因を問わず同一文言に統一し、アカウントの存在有無を推測させない。
 */
export function toAuthErrorMessage(error: unknown): string {
  const raw = extractMessage(error).toLowerCase();

  if (
    raw.includes('invalid login credentials') ||
    raw.includes('user not found') ||
    raw.includes('invalid credentials')
  ) {
    return 'メールアドレスまたはパスワードが正しくありません。';
  }
  return GENERIC_MESSAGE;
}

/** サインアップ失敗の文言 */
export function toSignUpErrorMessage(error: unknown): string {
  const raw = extractMessage(error).toLowerCase();

  if (raw.includes('already registered') || raw.includes('already exists')) {
    return 'このメールアドレスは既に登録されています。';
  }
  if (raw.includes('password should be at least')) {
    return 'パスワードは8文字以上で入力してください。';
  }
  // handle_new_user トリガが例外を送出すると Supabase Auth はこの文言に潰す。
  // 招待コードの競合（他者が先に使い切った等）が主な原因。
  if (raw.includes('database error saving new user')) {
    return '登録に失敗しました。招待コードをご確認のうえ、もう一度お試しください。';
  }
  return GENERIC_MESSAGE;
}
```

- [ ] **Step 7: テストを実行して成功を確認**

Run: `npm test`
Expected: PASS（15 テスト）

- [ ] **Step 8: 型チェックと lint を通す**

Run: `npm run typecheck && npm run lint`
Expected: どちらもエラーなし

`eslint.config.mjs` の `ignores` に `'coverage/**'` を追加しておく。

- [ ] **Step 9: コミット**

```bash
git add vitest.config.ts vitest.setup.ts package.json package-lock.json eslint.config.mjs src/features/auth/messages.ts src/features/auth/messages.test.ts
git commit -m "$(cat <<'EOF'
test: Vitest を導入し認証エラーの文言変換を実装

Supabase のエラーオブジェクトには入力値やトークンの断片が含まれ得るため、
表示用の日本語文言へ変換する純粋関数を用意する。ログイン失敗は原因を問わず
同一文言へ統一し、アカウント列挙を防ぐ。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 招待コードの事前検証 RPC

**Files:**
- Create: `supabase/migrations/0003_add_validate_invite_code.sql`
- Modify: `src/types/database.ts:129-142`（Functions セクション）

**Interfaces:**
- Consumes: `InviteCodeStatus`（Task 1）
- Produces: RPC `validate_invite_code(p_code: string): InviteCodeStatus`、型定義 `Database['public']['Functions']['validate_invite_code']`

**なぜ必要か:** `auth.users` のトリガが `RAISE EXCEPTION` すると Supabase Auth は `Database error saving new user`（HTTP 500）を返すのみで、SQL に書いた日本語メッセージはクライアントへ届かない。signUp を呼ぶ前に別途検証しないと、利用者に失敗の理由を提示できない。

- [ ] **Step 1: マイグレーションを作成**

`supabase/migrations/0003_add_validate_invite_code.sql`:

```sql
-- =============================================================================
-- 招待コードの事前検証 RPC
--
-- auth.users のトリガ handle_new_user が例外を送出しても、Supabase Auth は
-- "Database error saving new user" (500) を返すのみで、RAISE EXCEPTION に
-- 書いた日本語メッセージはクライアントへ届かない。失敗の理由を利用者へ
-- 提示するため、signUp を呼ぶ前にこの関数で状態を判定する。
--
-- トリガは削除しない。事前検証と signUp の間に他者が同じコードを使い切る
-- 競合（TOCTOU）が起こり得るため、トリガが最終防波堤として機能する。
-- =============================================================================

create or replace function public.validate_invite_code(p_code text)
returns text
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_invite public.invite_codes%rowtype;
  v_code   text := nullif(trim(p_code), '');
begin
  if v_code is null then
    return 'not_found';
  end if;

  select * into v_invite
  from public.invite_codes
  where code = v_code;

  if not found then
    return 'not_found';
  end if;
  if v_invite.is_used then
    return 'used';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    return 'expired';
  end if;
  return 'ok';
end;
$$;

comment on function public.validate_invite_code(text) is
  '招待コードの状態を ok / not_found / used / expired で返す。サインアップ前の事前検証に使用する';

-- 状態を表す固定文字列のみを返し、発行者・発行日時・使用者は開示しない。
-- サインアップ前の未認証状態から呼ぶ関数のため、anon にのみ EXECUTE を与える。
revoke all on function public.validate_invite_code(text) from public, authenticated;
grant execute on function public.validate_invite_code(text) to anon;
```

- [ ] **Step 2: 型定義に RPC を追加**

`src/types/database.ts` の `Functions` セクション（`is_admin` の直後）へ追加する:

```ts
      validate_invite_code: {
        Args: { p_code: string };
        Returns: InviteCodeStatus;
      };
```

同ファイル冒頭に型のインポートを追加する:

```ts
import type { InviteCodeStatus } from '@/features/auth/messages';
```

- [ ] **Step 3: 型チェックを通す**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 4: Supabase へ適用**

Supabase MCP の書き込みは環境の分類器にブロックされるため、人間が SQL Editor で適用する。

```bash
pbcopy < supabase/migrations/0003_add_validate_invite_code.sql
```

https://supabase.com/dashboard/project/qhpzasgiayhmbfiynyzu/sql/new を開いて貼り付け、Run を実行する。
`Success. No rows returned` が出れば成功。

- [ ] **Step 5: 適用結果を検証**

Supabase MCP の `get_advisors`（security）を実行し、新規の WARN が増えていないことを確認する。
`validate_invite_code` が `anon` から実行可能である旨の WARN は**意図的**なので許容する。

- [ ] **Step 6: コミット**

```bash
git add supabase/migrations/0003_add_validate_invite_code.sql src/types/database.ts
git commit -m "$(cat <<'EOF'
feat: 招待コードの事前検証RPCを追加

auth.users のトリガが送出する例外メッセージは Supabase Auth が
"Database error saving new user" に潰すためクライアントへ届かない。
signUp の前に状態を判定できる RPC を追加し、利用者へ失敗理由を提示する。

戻り値は ok / not_found / used / expired の固定文字列のみとし、
発行者や使用者の情報は開示しない。未認証から呼ぶ関数のため
EXECUTE は anon にのみ付与する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: パスワード検証専用クライアント

**Files:**
- Create: `src/lib/supabase/verify.ts`

**Interfaces:**
- Consumes: `getPublicEnv()`（`@/lib/env`）、`Database`（`@/types/database`）
- Produces: `verifyPassword(email: string, password: string): Promise<boolean>`

**設計の要点:** `persistSession: false` により、検証の成否にかかわらず現在のセッション Cookie は書き換わらない。`signInWithPassword` は成功時にトークンを返すが、永続化されないため即座に破棄される。

- [ ] **Step 1: 実装を書く**

`src/lib/supabase/verify.ts`:

```ts
'use client';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getPublicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * 再認証のためにパスワードのみを検証する。
 *
 * persistSession:false の使い捨てクライアントを用いるため、検証の成否に
 * かかわらず現在のログインセッションには一切影響しない。取得したトークンは
 * 永続化されず、関数を抜けた時点で破棄される。
 *
 * パスワードはこの関数の外へ渡さず、呼び出し側は実行後に速やかに破棄すること。
 *
 * @returns パスワードが正しければ true。誤りや通信失敗なら false
 */
export async function verifyPassword(
  email: string,
  password: string,
): Promise<boolean> {
  if (email.length === 0 || password.length === 0) {
    return false;
  }

  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();

  const client = createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  try {
    const { error } = await client.auth.signInWithPassword({ email, password });
    return error === null;
  } catch {
    // 通信失敗も「検証できなかった」として扱う。
    // エラーオブジェクトには入力値が含まれ得るため出力しない（CLAUDE.md 2章）。
    return false;
  }
}
```

- [ ] **Step 2: 型チェックと lint を通す**

Run: `npm run typecheck && npm run lint`
Expected: どちらもエラーなし

- [ ] **Step 3: コミット**

```bash
git add src/lib/supabase/verify.ts
git commit -m "$(cat <<'EOF'
feat: 再認証用のパスワード検証クライアントを追加

persistSession:false の使い捨てクライアントで signInWithPassword を呼び、
現在のセッション Cookie に影響を与えずにパスワードのみを検証する。
取得したトークンは永続化せず破棄する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 再認証の状態管理

**Files:**
- Create: `src/features/auth/ReauthProvider.tsx`
- Create: `src/features/auth/useReauth.ts`
- Test: `src/features/auth/useReauth.test.tsx`

**Interfaces:**
- Consumes: `verifyPassword`（Task 3）
- Produces:
  - `<ReauthProvider email={string}>` — 有効期限をメモリ上で保持する Context
  - `useReauth(): ReauthContextValue`
  - `interface ReauthContextValue { isDialogOpen: boolean; errorMessage: string; isVerifying: boolean; requireReauth: (action: () => void | Promise<void>) => void; submitPassword: (password: string) => Promise<void>; cancel: () => void; }`
  - `REAUTH_VALID_MS: number`（= 5 分）
  - `isReauthValid(validUntil: number | null, now: number): boolean`

**設計の要点:** 有効期限は React state（メモリ）にのみ保持し、`localStorage` や Cookie へ書かない。タブを閉じれば失効する。

- [ ] **Step 1: 失敗するテストを書く**

`src/features/auth/useReauth.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ReauthProvider } from './ReauthProvider';
import { useReauth, isReauthValid, REAUTH_VALID_MS } from './useReauth';

vi.mock('@/lib/supabase/verify', () => ({
  verifyPassword: vi.fn(),
}));

const { verifyPassword } = await import('@/lib/supabase/verify');
const mockedVerify = vi.mocked(verifyPassword);

function wrapper({ children }: { children: ReactNode }) {
  return <ReauthProvider email="user@example.com">{children}</ReauthProvider>;
}

describe('isReauthValid', () => {
  it('未検証なら無効', () => {
    expect(isReauthValid(null, 1_000)).toBe(false);
  });

  it('有効期限内なら有効', () => {
    expect(isReauthValid(10_000, 9_999)).toBe(true);
  });

  it('有効期限ちょうどは無効として扱う', () => {
    expect(isReauthValid(10_000, 10_000)).toBe(false);
  });

  it('有効期限を過ぎていれば無効', () => {
    expect(isReauthValid(10_000, 10_001)).toBe(false);
  });
});

describe('REAUTH_VALID_MS', () => {
  it('5分である', () => {
    expect(REAUTH_VALID_MS).toBe(5 * 60 * 1000);
  });
});

describe('useReauth', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockedVerify.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('未検証の状態ではダイアログを開き、処理を実行しない', () => {
    const action = vi.fn();
    const { result } = renderHook(() => useReauth(), { wrapper });

    act(() => result.current.requireReauth(action));

    expect(result.current.isDialogOpen).toBe(true);
    expect(action).not.toHaveBeenCalled();
  });

  it('パスワード検証に成功すると保留していた処理を実行する', async () => {
    mockedVerify.mockResolvedValue(true);
    const action = vi.fn();
    const { result } = renderHook(() => useReauth(), { wrapper });

    act(() => result.current.requireReauth(action));
    await act(async () => {
      await result.current.submitPassword('correct-password');
    });

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(result.current.isDialogOpen).toBe(false);
  });

  it('検証成功から5分以内はダイアログを開かず即実行する', async () => {
    mockedVerify.mockResolvedValue(true);
    const { result } = renderHook(() => useReauth(), { wrapper });

    act(() => result.current.requireReauth(vi.fn()));
    await act(async () => {
      await result.current.submitPassword('correct-password');
    });

    vi.advanceTimersByTime(4 * 60 * 1000);

    const secondAction = vi.fn();
    act(() => result.current.requireReauth(secondAction));

    expect(result.current.isDialogOpen).toBe(false);
    await waitFor(() => expect(secondAction).toHaveBeenCalledTimes(1));
  });

  it('検証成功から5分を過ぎると再びダイアログを開く', async () => {
    mockedVerify.mockResolvedValue(true);
    const { result } = renderHook(() => useReauth(), { wrapper });

    act(() => result.current.requireReauth(vi.fn()));
    await act(async () => {
      await result.current.submitPassword('correct-password');
    });

    vi.advanceTimersByTime(REAUTH_VALID_MS + 1);

    const secondAction = vi.fn();
    act(() => result.current.requireReauth(secondAction));

    expect(result.current.isDialogOpen).toBe(true);
    expect(secondAction).not.toHaveBeenCalled();
  });

  it('パスワード検証に失敗するとエラーを表示し処理を実行しない', async () => {
    mockedVerify.mockResolvedValue(false);
    const action = vi.fn();
    const { result } = renderHook(() => useReauth(), { wrapper });

    act(() => result.current.requireReauth(action));
    await act(async () => {
      await result.current.submitPassword('wrong-password');
    });

    expect(result.current.errorMessage).toBe('パスワードが正しくありません。');
    expect(result.current.isDialogOpen).toBe(true);
    expect(action).not.toHaveBeenCalled();
  });

  it('キャンセルすると保留中の処理を破棄する', async () => {
    const action = vi.fn();
    const { result } = renderHook(() => useReauth(), { wrapper });

    act(() => result.current.requireReauth(action));
    act(() => result.current.cancel());

    expect(result.current.isDialogOpen).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test -- useReauth`
Expected: FAIL — `Failed to resolve import "./ReauthProvider"`

- [ ] **Step 3: Context を実装**

`src/features/auth/ReauthProvider.tsx`:

```tsx
'use client';

import {
  createContext,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { verifyPassword } from '@/lib/supabase/verify';

/** 再認証が有効とみなされる時間（5分） */
export const REAUTH_VALID_MS = 5 * 60 * 1000;

/** 保留中の処理。再認証成功後に実行される */
type PendingAction = () => void | Promise<void>;

export interface ReauthContextValue {
  isDialogOpen: boolean;
  errorMessage: string;
  isVerifying: boolean;
  requireReauth: (action: PendingAction) => void;
  submitPassword: (password: string) => Promise<void>;
  cancel: () => void;
}

export const ReauthContext = createContext<ReauthContextValue | null>(null);

/** 有効期限の判定。境界値（ちょうど期限）は無効として扱う */
export function isReauthValid(
  validUntil: number | null,
  now: number,
): boolean {
  return validUntil !== null && now < validUntil;
}

/**
 * 再認証の有効期限を保持する Provider。
 *
 * 有効期限は React state（メモリ）にのみ保持し、localStorage や Cookie へは
 * 書き込まない。タブを閉じれば失効するため、共有端末でのリスクを抑えられる。
 */
export function ReauthProvider({
  email,
  children,
}: {
  email: string;
  children: ReactNode;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const validUntilRef = useRef<number | null>(null);
  const pendingActionRef = useRef<PendingAction | null>(null);

  const requireReauth = useCallback((action: PendingAction) => {
    if (isReauthValid(validUntilRef.current, Date.now())) {
      void action();
      return;
    }
    pendingActionRef.current = action;
    setErrorMessage('');
    setIsDialogOpen(true);
  }, []);

  const submitPassword = useCallback(
    async (password: string) => {
      setIsVerifying(true);
      const ok = await verifyPassword(email, password);
      setIsVerifying(false);

      if (!ok) {
        setErrorMessage('パスワードが正しくありません。');
        return;
      }

      validUntilRef.current = Date.now() + REAUTH_VALID_MS;
      setErrorMessage('');
      setIsDialogOpen(false);

      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      if (action) {
        await action();
      }
    },
    [email],
  );

  const cancel = useCallback(() => {
    pendingActionRef.current = null;
    setErrorMessage('');
    setIsDialogOpen(false);
  }, []);

  const value = useMemo<ReauthContextValue>(
    () => ({
      isDialogOpen,
      errorMessage,
      isVerifying,
      requireReauth,
      submitPassword,
      cancel,
    }),
    [
      isDialogOpen,
      errorMessage,
      isVerifying,
      requireReauth,
      submitPassword,
      cancel,
    ],
  );

  return (
    <ReauthContext.Provider value={value}>{children}</ReauthContext.Provider>
  );
}
```

- [ ] **Step 4: フックを実装**

`src/features/auth/useReauth.ts`:

```ts
'use client';

import { useContext } from 'react';
import { ReauthContext, type ReauthContextValue } from './ReauthProvider';

export { REAUTH_VALID_MS, isReauthValid } from './ReauthProvider';

/**
 * 再認証を要求するフック。
 * ReauthProvider の内側でのみ使用できる。
 */
export function useReauth(): ReauthContextValue {
  const context = useContext(ReauthContext);
  if (context === null) {
    throw new Error('useReauth は ReauthProvider の内側で使用してください。');
  }
  return context;
}
```

- [ ] **Step 5: テストを実行して成功を確認**

Run: `npm test -- useReauth`
Expected: PASS（12 テスト）

- [ ] **Step 6: 型チェックと lint を通す**

Run: `npm run typecheck && npm run lint`
Expected: どちらもエラーなし

- [ ] **Step 7: コミット**

```bash
git add src/features/auth/ReauthProvider.tsx src/features/auth/useReauth.ts src/features/auth/useReauth.test.tsx
git commit -m "$(cat <<'EOF'
feat: 再認証の状態管理を実装

requireReauth() で処理を保留し、直近5分以内に検証済みなら即実行、
そうでなければダイアログを開いてパスワードを要求する。

有効期限は React state（メモリ）にのみ保持し、localStorage や Cookie へは
書き込まない。タブを閉じれば失効するため共有端末でのリスクを抑えられる。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 認証の Server Actions

**Files:**
- Create: `src/features/auth/actions.ts`

**Interfaces:**
- Consumes: `toAuthErrorMessage` / `toSignUpErrorMessage` / `INVITE_CODE_MESSAGES` / `InviteCodeStatus`（Task 1）、RPC `validate_invite_code`（Task 2）、`createClient`（`@/lib/supabase/server`）
- Produces:
  - `type AuthFormState = { errorMessage: string }`
  - `signInAction(prevState: AuthFormState, formData: FormData): Promise<AuthFormState>`
  - `signUpAction(prevState: AuthFormState, formData: FormData): Promise<AuthFormState>`
  - `signOutAction(): Promise<never>`
  - `AUTH_INITIAL_STATE: AuthFormState`

**設計の要点:** `useActionState` と組み合わせるため、戻り値は必ず `AuthFormState`。成功時は `redirect()` を呼ぶので戻り値へ到達しない。`redirect()` は内部で例外を投げるため、`try/catch` で囲んではならない。

- [ ] **Step 1: 実装を書く**

`src/features/auth/actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  toAuthErrorMessage,
  toSignUpErrorMessage,
  INVITE_CODE_MESSAGES,
  type InviteCodeStatus,
} from './messages';

export interface AuthFormState {
  errorMessage: string;
}

export const AUTH_INITIAL_STATE: AuthFormState = { errorMessage: '' };

/** FormData から文字列を取り出す。未入力・型違いは空文字とする */
function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export async function signInAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readString(formData, 'email');
  // パスワードは trim しない。前後の空白も本人が設定した文字の一部でありうる。
  const passwordValue = formData.get('password');
  const password = typeof passwordValue === 'string' ? passwordValue : '';

  if (email.length === 0 || password.length === 0) {
    return { errorMessage: 'メールアドレスとパスワードを入力してください。' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { errorMessage: toAuthErrorMessage(error) };
  }

  // redirect() は例外を投げて制御を移すため、try/catch の外で呼ぶ
  redirect('/');
}

export async function signUpAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readString(formData, 'email');
  const displayName = readString(formData, 'displayName');
  const inviteCode = readString(formData, 'inviteCode');
  const passwordValue = formData.get('password');
  const password = typeof passwordValue === 'string' ? passwordValue : '';

  if (email.length === 0 || password.length === 0) {
    return { errorMessage: 'メールアドレスとパスワードを入力してください。' };
  }
  if (password.length < 8) {
    return { errorMessage: 'パスワードは8文字以上で入力してください。' };
  }

  const supabase = await createClient();

  // 既存ユーザーの有無で招待コードの要否が変わる
  const { data: hasAnyUser, error: hasAnyUserError } =
    await supabase.rpc('has_any_user');

  if (hasAnyUserError) {
    return {
      errorMessage: '処理に失敗しました。時間をおいて再度お試しください。',
    };
  }

  if (hasAnyUser === true) {
    if (inviteCode.length === 0) {
      return { errorMessage: '招待コードを入力してください。' };
    }

    // トリガの例外メッセージはクライアントへ届かないため、ここで理由を判定する
    const { data: status, error: validateError } = await supabase.rpc(
      'validate_invite_code',
      { p_code: inviteCode },
    );

    if (validateError) {
      return {
        errorMessage: '処理に失敗しました。時間をおいて再度お試しください。',
      };
    }
    if (status !== 'ok') {
      return {
        errorMessage: INVITE_CODE_MESSAGES[status as InviteCodeStatus],
      };
    }
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        invite_code: inviteCode,
        display_name: displayName,
      },
    },
  });

  if (error) {
    return { errorMessage: toSignUpErrorMessage(error) };
  }

  redirect('/');
}

export async function signOutAction(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
```

- [ ] **Step 2: 型チェックと lint を通す**

Run: `npm run typecheck && npm run lint`
Expected: どちらもエラーなし

`signInAction` の戻り値型が `Promise<AuthFormState>` なのに `redirect()` で終わる経路がある点は、`redirect()` の戻り値型が `never` のため型エラーにならない。

- [ ] **Step 3: コミット**

```bash
git add src/features/auth/actions.ts
git commit -m "$(cat <<'EOF'
feat: ログイン・サインアップ・ログアウトのServer Actionを実装

Server Action 内で SSR クライアントを使うことで、セッション Cookie が
httpOnly 属性付きでサーバー側から設定される。

サインアップでは has_any_user で招待コードの要否を判定し、必要な場合は
validate_invite_code で事前検証してから signUp を呼ぶ。受け取った
パスワードは Auth への呼び出しにのみ使い、いかなる出力にも含めない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: ログイン・サインアップ画面

**Files:**
- Create: `src/app/(auth)/layout.tsx`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/signup/page.tsx`
- Create: `src/features/auth/LoginForm.tsx`
- Create: `src/features/auth/SignupForm.tsx`

**Interfaces:**
- Consumes: `signInAction` / `signUpAction` / `AUTH_INITIAL_STATE` / `AuthFormState`（Task 5）、`speakComplete` / `speakError`（`@/lib/speech`）、RPC `has_any_user`
- Produces: ルート `/login`、`/signup`

**設計の要点:** `has_any_user` は Server Component で取得し、`requiresInviteCode` として Client Component へ渡す。フォームの状態管理は React 19 の `useActionState` を使う。

- [ ] **Step 1: 未認証向けレイアウトを作成**

`src/app/(auth)/layout.tsx`:

```tsx
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-wood-900 bg-wood-grain p-4">
      <div className="w-full max-w-md rounded-lg bg-wood-50 p-8 shadow-book">
        <h1 className="mb-6 text-center text-2xl font-bold text-wood-800">
          Bookshelf
        </h1>
        {children}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: ログインフォームを作成**

`src/features/auth/LoginForm.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signInAction, AUTH_INITIAL_STATE } from './actions';

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(
    signInAction,
    AUTH_INITIAL_STATE,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-wood-800"
        >
          メールアドレス
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-1 w-full rounded border border-wood-300 px-3 py-2 text-wood-900"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-wood-800"
        >
          パスワード
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded border border-wood-300 px-3 py-2 text-wood-900"
        />
      </div>

      {state.errorMessage.length > 0 && (
        <p role="alert" className="text-sm text-red-700">
          {state.errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded bg-wood-600 py-2 font-medium text-wood-50 hover:bg-wood-700 disabled:opacity-60"
      >
        {isPending ? 'ログイン中…' : 'ログイン'}
      </button>

      <p className="text-center text-sm text-wood-700">
        アカウントをお持ちでない方は{' '}
        <Link href="/signup" className="underline">
          新規登録
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 3: ログインページを作成**

`src/app/(auth)/login/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { LoginForm } from '@/features/auth/LoginForm';

export const metadata: Metadata = { title: 'ログイン | Bookshelf' };

export default function LoginPage() {
  return <LoginForm />;
}
```

**仕様書 9章との差異:** 仕様書は「サインアップ成功時に `speakComplete()`」と
記載しているが、成功時は Server Action が `redirect()` を呼ぶためクライアントの
`useEffect` へ制御が戻らず、実現できない。本計画では**サインアップは失敗時の
`speakError()` のみ**とする。招待コード発行の `speakComplete()` は
クライアント側で完結するため仕様書どおり実装できる。

- [ ] **Step 4: サインアップフォームを作成**

`src/features/auth/SignupForm.tsx`:

```tsx
'use client';

import { useActionState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { signUpAction, AUTH_INITIAL_STATE } from './actions';
import { speakError } from '@/lib/speech';

export function SignupForm({
  requiresInviteCode,
}: {
  requiresInviteCode: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    signUpAction,
    AUTH_INITIAL_STATE,
  );
  const previousError = useRef('');

  // 失敗時のみ音声案内を鳴らす。成功時は redirect されるため到達しない。
  useEffect(() => {
    if (
      state.errorMessage.length > 0 &&
      state.errorMessage !== previousError.current
    ) {
      speakError();
    }
    previousError.current = state.errorMessage;
  }, [state.errorMessage]);

  return (
    <form action={formAction} className="space-y-4">
      {!requiresInviteCode && (
        <p className="rounded bg-wood-100 p-3 text-sm text-wood-800">
          最初のユーザー登録です。招待コードは不要で、管理者として登録されます。
        </p>
      )}

      <div>
        <label
          htmlFor="displayName"
          className="block text-sm font-medium text-wood-800"
        >
          表示名
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="nickname"
          className="mt-1 w-full rounded border border-wood-300 px-3 py-2 text-wood-900"
        />
      </div>

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-wood-800"
        >
          メールアドレス
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-1 w-full rounded border border-wood-300 px-3 py-2 text-wood-900"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-wood-800"
        >
          パスワード
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="mt-1 w-full rounded border border-wood-300 px-3 py-2 text-wood-900"
        />
        <p className="mt-1 text-xs text-wood-600">8文字以上で入力してください</p>
      </div>

      {requiresInviteCode && (
        <div>
          <label
            htmlFor="inviteCode"
            className="block text-sm font-medium text-wood-800"
          >
            招待コード
          </label>
          <input
            id="inviteCode"
            name="inviteCode"
            type="text"
            required
            className="mt-1 w-full rounded border border-wood-300 px-3 py-2 font-mono tracking-wider text-wood-900"
          />
        </div>
      )}

      {state.errorMessage.length > 0 && (
        <p role="alert" className="text-sm text-red-700">
          {state.errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded bg-wood-600 py-2 font-medium text-wood-50 hover:bg-wood-700 disabled:opacity-60"
      >
        {isPending ? '登録中…' : '登録する'}
      </button>

      <p className="text-center text-sm text-wood-700">
        既にアカウントをお持ちの方は{' '}
        <Link href="/login" className="underline">
          ログイン
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 5: サインアップページを作成**

`src/app/(auth)/signup/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { SignupForm } from '@/features/auth/SignupForm';

export const metadata: Metadata = { title: '新規登録 | Bookshelf' };

// 既存ユーザーの有無は登録のたびに変わるため、キャッシュしない
export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('has_any_user');

  // 判定に失敗した場合は安全側に倒し、招待コードを必須として扱う
  const requiresInviteCode = error !== null || data !== false;

  return <SignupForm requiresInviteCode={requiresInviteCode} />;
}
```

- [ ] **Step 6: 型チェックと lint とビルドを通す**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: すべてエラーなし

この時点では `(app)` がまだ無く `src/app/page.tsx` が残っているため、`/` は既存の仮ページのままで良い。

- [ ] **Step 7: コミット**

```bash
git add "src/app/(auth)" src/features/auth/LoginForm.tsx src/features/auth/SignupForm.tsx
git commit -m "$(cat <<'EOF'
feat: ログイン・サインアップ画面を追加

Route Group (auth) で未認証向けレイアウトを分離する。
サインアップ画面は has_any_user の結果で招待コード欄を出し分け、
判定に失敗した場合は安全側に倒して招待コードを必須とする。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: ルート保護と認証必須レイアウト

**Files:**
- Modify: `src/lib/supabase/middleware.ts`（`updateSession` を拡張）
- Create: `src/app/(app)/layout.tsx`
- Move: `src/app/page.tsx` → `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `signOutAction`（Task 5）、`ReauthProvider`（Task 4）
- Produces: 未認証時のリダイレクト、`(app)` 配下で `ReauthProvider` が利用可能になる

**設計の要点:** 判定には `getUser()` を使う。`getSession()` は Cookie の内容を検証せずに返すため、保護の判断に使ってはならない。

- [ ] **Step 1: middleware にルート保護を追加**

`src/lib/supabase/middleware.ts` の `await supabase.auth.getUser();` の行を以下へ置き換える:

```ts
  // getUser() を呼ぶことでトークンの検証とリフレッシュが行われる。
  // getSession() は Cookie の内容を検証せずに返すため保護の判断には使わない。
  // 取得したユーザー情報はここではログ出力しない。
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname === '/login' || pathname === '/signup';

  if (user === null && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (user !== null && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
```

末尾に既にある `return response;` は重複するため削除する。

- [ ] **Step 2: 認証必須レイアウトを作成**

`src/app/(app)/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { signOutAction } from '@/features/auth/actions';
import { ReauthProvider } from '@/features/auth/ReauthProvider';

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // middleware でも保護しているが、レイアウト側でも確認して二重に守る
  if (user === null) {
    redirect('/login');
  }

  return (
    <ReauthProvider email={user.email ?? ''}>
      <div className="min-h-screen bg-wood-900 bg-wood-grain">
        <header className="flex items-center justify-between bg-wood-800 px-4 py-3 shadow-shelf">
          <Link href="/" className="text-lg font-bold text-wood-50">
            Bookshelf
          </Link>
          <nav className="flex items-center gap-4 text-sm text-wood-100">
            <Link href="/settings/invites" className="hover:underline">
              招待コード
            </Link>
            <form action={signOutAction}>
              <button type="submit" className="hover:underline">
                ログアウト
              </button>
            </form>
          </nav>
        </header>
        <main className="p-4">{children}</main>
      </div>
    </ReauthProvider>
  );
}
```

- [ ] **Step 3: 本棚ページを移設**

```bash
git mv src/app/page.tsx "src/app/(app)/page.tsx"
```

移設後、`src/app/(app)/page.tsx` の内容が `(app)/layout.tsx` の `<main>` 内へ入ることを踏まえ、
ページ側に全画面の背景指定（`min-h-screen` や背景色）が残っていれば削除する。

- [ ] **Step 4: 型チェックと lint とビルドを通す**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: すべてエラーなし。ビルド出力に `/login` `/signup` `/` が現れる

- [ ] **Step 5: コミット**

```bash
git add src/lib/supabase/middleware.ts "src/app/(app)"
git commit -m "$(cat <<'EOF'
feat: 認証によるルート保護と認証必須レイアウトを追加

middleware で未認証を /login へ、認証済みの /login /signup を / へ
リダイレクトする。判定には getUser() を使う。getSession() は Cookie の
内容を検証せずに返すため保護の判断には使わない。

本棚ページを Route Group (app) 配下へ移し、ReauthProvider を
このレイアウトで供給する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 招待コードの表示整形と Server Actions

**Files:**
- Create: `src/features/invites/format.ts`
- Test: `src/features/invites/format.test.ts`
- Create: `src/features/invites/actions.ts`

**Interfaces:**
- Consumes: `InviteCode`（`@/types/database`）、`createClient`（`@/lib/supabase/server`）、RPC `generate_invite_code`
- Produces:
  - `type InviteExpiryOption = 'none' | '1' | '7' | '30'`
  - `EXPIRY_OPTIONS: ReadonlyArray<{ value: InviteExpiryOption; label: string }>`
  - `DEFAULT_EXPIRY_OPTION: InviteExpiryOption`（= `'7'`）
  - `toExpiresInDays(option: InviteExpiryOption): number | null`
  - `isExpired(expiresAt: string | null, now: Date): boolean`
  - `formatExpiry(expiresAt: string | null, now: Date): string`
  - `type InviteActionState = { errorMessage: string; successMessage: string }`
  - `generateInviteCodeAction(prevState, formData): Promise<InviteActionState>`
  - `deleteInviteCodeAction(prevState, formData): Promise<InviteActionState>`
  - `INVITE_INITIAL_STATE: InviteActionState`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/invites/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  toExpiresInDays,
  isExpired,
  formatExpiry,
  DEFAULT_EXPIRY_OPTION,
  EXPIRY_OPTIONS,
} from './format';

const NOW = new Date('2026-09-10T12:00:00Z');

describe('DEFAULT_EXPIRY_OPTION', () => {
  it('既定は7日である', () => {
    expect(DEFAULT_EXPIRY_OPTION).toBe('7');
  });
});

describe('EXPIRY_OPTIONS', () => {
  it('無期限・1日・7日・30日の4種類を持つ', () => {
    expect(EXPIRY_OPTIONS.map((option) => option.value)).toEqual([
      'none',
      '1',
      '7',
      '30',
    ]);
  });
});

describe('toExpiresInDays', () => {
  it('無期限は null を返す', () => {
    expect(toExpiresInDays('none')).toBeNull();
  });

  it('日数指定は数値を返す', () => {
    expect(toExpiresInDays('1')).toBe(1);
    expect(toExpiresInDays('7')).toBe(7);
    expect(toExpiresInDays('30')).toBe(30);
  });
});

describe('isExpired', () => {
  it('無期限は期限切れにならない', () => {
    expect(isExpired(null, NOW)).toBe(false);
  });

  it('未来の日時は期限切れではない', () => {
    expect(isExpired('2026-09-11T12:00:00Z', NOW)).toBe(false);
  });

  it('過去の日時は期限切れである', () => {
    expect(isExpired('2026-09-09T12:00:00Z', NOW)).toBe(true);
  });

  it('解釈できない値は期限切れとして扱う', () => {
    expect(isExpired('not-a-date', NOW)).toBe(true);
  });
});

describe('formatExpiry', () => {
  it('無期限を明示する', () => {
    expect(formatExpiry(null, NOW)).toBe('無期限');
  });

  it('期限切れを明示する', () => {
    expect(formatExpiry('2026-09-09T12:00:00Z', NOW)).toBe('期限切れ');
  });

  it('有効な期限は日付を表示する', () => {
    expect(formatExpiry('2026-09-17T12:00:00Z', NOW)).toBe('2026/09/17 まで');
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test -- format`
Expected: FAIL — `Failed to resolve import "./format"`

- [ ] **Step 3: 実装を書く**

`src/features/invites/format.ts`:

```ts
/**
 * 招待コードの有効期限に関する表示整形（純粋関数）。
 * now を引数で受け取り、テスト可能に保つ。
 */

export type InviteExpiryOption = 'none' | '1' | '7' | '30';

export const EXPIRY_OPTIONS: ReadonlyArray<{
  value: InviteExpiryOption;
  label: string;
}> = [
  { value: 'none', label: '無期限' },
  { value: '1', label: '1日' },
  { value: '7', label: '7日' },
  { value: '30', label: '30日' },
];

export const DEFAULT_EXPIRY_OPTION: InviteExpiryOption = '7';

/** generate_invite_code へ渡す日数。無期限は null */
export function toExpiresInDays(option: InviteExpiryOption): number | null {
  return option === 'none' ? null : Number(option);
}

/** 期限切れか。解釈できない値は安全側に倒して期限切れとして扱う */
export function isExpired(expiresAt: string | null, now: Date): boolean {
  if (expiresAt === null) {
    return false;
  }
  const time = new Date(expiresAt).getTime();
  if (Number.isNaN(time)) {
    return true;
  }
  return time < now.getTime();
}

/** 一覧に表示する有効期限の文字列 */
export function formatExpiry(expiresAt: string | null, now: Date): string {
  if (expiresAt === null) {
    return '無期限';
  }
  if (isExpired(expiresAt, now)) {
    return '期限切れ';
  }
  const date = new Date(expiresAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day} まで`;
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test -- format`
Expected: PASS（12 テスト）

- [ ] **Step 5: Server Actions を実装**

`src/features/invites/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { toExpiresInDays, type InviteExpiryOption } from './format';

export interface InviteActionState {
  errorMessage: string;
  successMessage: string;
}

export const INVITE_INITIAL_STATE: InviteActionState = {
  errorMessage: '',
  successMessage: '',
};

const GENERIC_ERROR = '処理に失敗しました。時間をおいて再度お試しください。';

function readExpiryOption(formData: FormData): InviteExpiryOption {
  const value = formData.get('expiry');
  if (value === 'none' || value === '1' || value === '7' || value === '30') {
    return value;
  }
  return '7';
}

export async function generateInviteCodeAction(
  _prevState: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const supabase = await createClient();
  const expiresInDays = toExpiresInDays(readExpiryOption(formData));

  const { error } = await supabase.rpc('generate_invite_code', {
    p_expires_in_days: expiresInDays,
  });

  if (error) {
    // エラーオブジェクトは出力しない（CLAUDE.md 2章）
    return { errorMessage: GENERIC_ERROR, successMessage: '' };
  }

  revalidatePath('/settings/invites');
  return { errorMessage: '', successMessage: '招待コードを発行しました。' };
}

export async function deleteInviteCodeAction(
  _prevState: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const idValue = formData.get('id');
  const id = typeof idValue === 'string' ? idValue : '';

  if (id.length === 0) {
    return { errorMessage: GENERIC_ERROR, successMessage: '' };
  }

  const supabase = await createClient();
  // RLS invite_codes_delete_own により、未使用かつ自分が発行したコードのみ削除できる
  const { error } = await supabase.from('invite_codes').delete().eq('id', id);

  if (error) {
    return { errorMessage: GENERIC_ERROR, successMessage: '' };
  }

  revalidatePath('/settings/invites');
  return { errorMessage: '', successMessage: '招待コードを削除しました。' };
}
```

- [ ] **Step 6: 型チェックと lint を通す**

Run: `npm run typecheck && npm run lint && npm test`
Expected: すべてエラーなし

- [ ] **Step 7: コミット**

```bash
git add src/features/invites/format.ts src/features/invites/format.test.ts src/features/invites/actions.ts
git commit -m "$(cat <<'EOF'
feat: 招待コードの表示整形とServer Actionを実装

有効期限の整形と期限切れ判定を純粋関数として切り出し、now を引数で
受け取ることでテスト可能に保つ。既定の有効期限は7日とする。

削除は RLS invite_codes_delete_own に委ね、未使用かつ自分が発行した
コードのみが削除される。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 再認証ダイアログと招待コード管理画面

**Files:**
- Create: `src/features/auth/ReauthDialog.tsx`
- Create: `src/features/invites/GenerateInviteButton.tsx`
- Create: `src/features/invites/InviteCodeList.tsx`
- Create: `src/app/(app)/settings/invites/page.tsx`

**Interfaces:**
- Consumes: `useReauth`（Task 4）、`generateInviteCodeAction` / `deleteInviteCodeAction` / `INVITE_INITIAL_STATE` / `InviteActionState`（Task 8）、`EXPIRY_OPTIONS` / `DEFAULT_EXPIRY_OPTION` / `formatExpiry`（Task 8）、`speakReauth` / `speakComplete` / `speakError`（`@/lib/speech`）、`InviteCode`（`@/types/database`）
- Produces: ルート `/settings/invites`

**設計の要点:** 発行・コピー・詳細閲覧のいずれも `requireReauth()` を経由する。ダイアログはページ単位ではなく `(app)` 配下で常時マウントし、`useReauth().isDialogOpen` で表示を切り替える。

- [ ] **Step 1: 再認証ダイアログを作成**

`src/features/auth/ReauthDialog.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useReauth } from './useReauth';
import { speakReauth } from '@/lib/speech';

export function ReauthDialog() {
  const { isDialogOpen, errorMessage, isVerifying, submitPassword, cancel } =
    useReauth();
  const [password, setPassword] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // ダイアログを開いた瞬間に音声案内を鳴らし、入力欄へフォーカスする
  useEffect(() => {
    if (isDialogOpen) {
      speakReauth();
      inputRef.current?.focus();
    } else {
      setPassword('');
    }
  }, [isDialogOpen]);

  if (!isDialogOpen) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entered = password;
    // 検証呼び出しの直後に state から破棄する
    setPassword('');
    await submitPassword(entered);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reauth-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-sm rounded-lg bg-wood-50 p-6 shadow-book">
        <h2 id="reauth-title" className="mb-2 text-lg font-bold text-wood-900">
          パスワードの再認証
        </h2>
        <p className="mb-4 text-sm text-wood-700">
          セキュリティ保護のため、パスワードを再入力してください。
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            ref={inputRef}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="w-full rounded border border-wood-300 px-3 py-2 text-wood-900"
          />

          {errorMessage.length > 0 && (
            <p role="alert" className="text-sm text-red-700">
              {errorMessage}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={cancel}
              className="flex-1 rounded border border-wood-400 py-2 text-wood-800"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isVerifying}
              className="flex-1 rounded bg-wood-600 py-2 font-medium text-wood-50 hover:bg-wood-700 disabled:opacity-60"
            >
              {isVerifying ? '確認中…' : '確認'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: レイアウトへダイアログを常時マウント**

`src/app/(app)/layout.tsx` の `<ReauthProvider ...>` の直下、`<div className="min-h-screen ...">` の**直前**へ以下を追加する:

```tsx
      <ReauthDialog />
```

併せてインポートを追加する:

```tsx
import { ReauthDialog } from '@/features/auth/ReauthDialog';
```

- [ ] **Step 3: 発行ボタンを作成**

`src/features/invites/GenerateInviteButton.tsx`:

```tsx
'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useReauth } from '@/features/auth/useReauth';
import { speakComplete, speakError } from '@/lib/speech';
import {
  generateInviteCodeAction,
  INVITE_INITIAL_STATE,
} from './actions';
import {
  EXPIRY_OPTIONS,
  DEFAULT_EXPIRY_OPTION,
  type InviteExpiryOption,
} from './format';

export function GenerateInviteButton() {
  const [state, formAction, isPending] = useActionState(
    generateInviteCodeAction,
    INVITE_INITIAL_STATE,
  );
  const [expiry, setExpiry] = useState<InviteExpiryOption>(
    DEFAULT_EXPIRY_OPTION,
  );
  const { requireReauth } = useReauth();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.successMessage.length > 0) {
      speakComplete();
    } else if (state.errorMessage.length > 0) {
      speakError();
    }
  }, [state.successMessage, state.errorMessage]);

  function handleClick() {
    requireReauth(() => {
      formRef.current?.requestSubmit();
    });
  }

  return (
    <div className="space-y-2">
      <form ref={formRef} action={formAction} className="flex items-end gap-2">
        <div>
          <label
            htmlFor="expiry"
            className="block text-sm font-medium text-wood-100"
          >
            有効期限
          </label>
          <select
            id="expiry"
            name="expiry"
            value={expiry}
            onChange={(event) =>
              setExpiry(event.target.value as InviteExpiryOption)
            }
            className="mt-1 rounded border border-wood-300 bg-wood-50 px-3 py-2 text-wood-900"
          >
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleClick}
          disabled={isPending}
          className="rounded bg-wood-600 px-4 py-2 font-medium text-wood-50 hover:bg-wood-700 disabled:opacity-60"
        >
          {isPending ? '発行中…' : '招待コードを発行'}
        </button>
      </form>

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
  );
}
```

- [ ] **Step 4: 一覧コンポーネントを作成**

`src/features/invites/InviteCodeList.tsx`:

```tsx
'use client';

import { useActionState, useState } from 'react';
import { useReauth } from '@/features/auth/useReauth';
import { speakComplete } from '@/lib/speech';
import { deleteInviteCodeAction, INVITE_INITIAL_STATE } from './actions';
import { formatExpiry } from './format';
import type { InviteCode } from '@/types/database';

/** コードは既定で伏せ字にし、再認証を経た場合のみ表示する */
function maskCode(code: string): string {
  return '•'.repeat(code.length);
}

export function InviteCodeList({ codes }: { codes: readonly InviteCode[] }) {
  const [state, formAction] = useActionState(
    deleteInviteCodeAction,
    INVITE_INITIAL_STATE,
  );
  const [revealedIds, setRevealedIds] = useState<readonly string[]>([]);
  const [copiedId, setCopiedId] = useState('');
  const { requireReauth } = useReauth();
  const now = new Date();

  function handleReveal(id: string) {
    requireReauth(() => {
      setRevealedIds((previous) => [...previous, id]);
    });
  }

  function handleCopy(id: string, code: string) {
    requireReauth(async () => {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      speakComplete('招待コードをコピーしました。');
    });
  }

  if (codes.length === 0) {
    return (
      <p className="text-sm text-wood-200">
        発行済みの招待コードはありません。
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {state.errorMessage.length > 0 && (
        <p role="alert" className="text-sm text-red-300">
          {state.errorMessage}
        </p>
      )}

      <ul className="space-y-2">
        {codes.map((invite) => {
          const isRevealed = revealedIds.includes(invite.id);
          return (
            <li
              key={invite.id}
              className="flex flex-wrap items-center gap-3 rounded bg-wood-50 p-3 shadow-book"
            >
              <code className="font-mono tracking-wider text-wood-900">
                {isRevealed ? invite.code : maskCode(invite.code)}
              </code>

              <span className="text-sm text-wood-700">
                {invite.is_used
                  ? '使用済み'
                  : formatExpiry(invite.expires_at, now)}
              </span>

              {!isRevealed && (
                <button
                  type="button"
                  onClick={() => handleReveal(invite.id)}
                  className="text-sm text-wood-700 underline"
                >
                  表示
                </button>
              )}

              <button
                type="button"
                onClick={() => handleCopy(invite.id, invite.code)}
                className="text-sm text-wood-700 underline"
              >
                {copiedId === invite.id ? 'コピー済み' : 'コピー'}
              </button>

              {!invite.is_used && (
                <form action={formAction} className="ml-auto">
                  <input type="hidden" name="id" value={invite.id} />
                  <button
                    type="submit"
                    className="text-sm text-red-700 underline"
                  >
                    削除
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: 招待コード管理ページを作成**

`src/app/(app)/settings/invites/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { GenerateInviteButton } from '@/features/invites/GenerateInviteButton';
import { InviteCodeList } from '@/features/invites/InviteCodeList';

export const metadata: Metadata = { title: '招待コード | Bookshelf' };

// 発行・削除が即座に反映される必要があるためキャッシュしない
export const dynamic = 'force-dynamic';

export default async function InvitesPage() {
  const supabase = await createClient();

  // RLS invite_codes_select_own により、自分が発行したコードのみ取得される
  const { data, error } = await supabase
    .from('invite_codes')
    .select('*')
    .order('created_at', { ascending: false });

  const codes = error !== null || data === null ? [] : data;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-bold text-wood-50">招待コード</h1>

      <p className="text-sm text-wood-200">
        発行・表示・コピーの操作には、セキュリティ保護のためパスワードの再入力が
        必要です。一度確認すると5分間は再入力を求められません。
      </p>

      <GenerateInviteButton />

      {error !== null && (
        <p role="alert" className="text-sm text-red-300">
          招待コードの取得に失敗しました。時間をおいて再度お試しください。
        </p>
      )}

      <InviteCodeList codes={codes} />
    </div>
  );
}
```

- [ ] **Step 6: 型チェックと lint とビルドとテストを通す**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: すべてエラーなし。ビルド出力に `/settings/invites` が現れる

- [ ] **Step 7: コミット**

```bash
git add src/features/auth/ReauthDialog.tsx "src/app/(app)/layout.tsx" src/features/invites/GenerateInviteButton.tsx src/features/invites/InviteCodeList.tsx "src/app/(app)/settings"
git commit -m "$(cat <<'EOF'
feat: 再認証ダイアログと招待コード管理画面を追加

発行・表示・コピーはいずれも requireReauth() を経由し、再認証を経た
場合のみ実行される。ダイアログ表示時に speakReauth() で音声案内を鳴らす。

コードは既定で伏せ字にし、再認証後に表示する。一覧の取得は RLS
invite_codes_select_own により発行者本人と管理者のみに限定される。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: 受け入れ確認と PR 作成

**Files:**
- 変更なし（検証のみ）

**Interfaces:**
- Consumes: Task 1〜9 のすべて
- Produces: PR

**前提:** 「事前準備」の Supabase ダッシュボード設定（Confirm email を OFF）が完了していること。未実施の場合、手順 2 でサインアップ後に自動ログインされず失敗する。

- [ ] **Step 1: 自動検証をすべて実行**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: すべてエラー・警告なし

- [ ] **Step 2: 開発サーバーで受け入れ基準を手動確認**

`npm run dev` を起動し、設計書 11 章の受け入れ基準を順に確認する。

DB を初期状態へ戻す必要がある場合は、Supabase ダッシュボードの
Authentication → Users から全ユーザーを削除する（`profiles` は
`on delete cascade` で連動して消える）。

| # | 手順 | 期待結果 |
| --- | --- | --- |
| 1 | ユーザー0人の状態で `/signup` を開く | 招待コード欄が表示されず「最初のユーザー登録です」と出る |
| 2 | 登録する | `/` へ遷移する |
| 3 | Supabase で `profiles` を確認 | `role` が `admin` |
| 4 | ログアウトし `/signup` を開く | 招待コード欄が必須で表示される |
| 5 | 存在しないコードで登録 | 「招待コードが正しくありません。」 |
| 6 | `/settings/invites` で発行ボタンを押す | 再認証ダイアログが開き音声案内が鳴る |
| 7 | 誤ったパスワードを入力 | 「パスワードが正しくありません。」が出て発行されない |
| 8 | 正しいパスワードを入力 | コードが発行され一覧に表示される |
| 9 | 続けて「表示」を押す | 再認証を求められず即座に表示される |
| 10 | 発行したコードで別アカウントを登録 | 登録でき、`is_used` が true、`used_by` が新規ユーザーの ID |
| 11 | 使用済みコードで再度登録 | 「この招待コードは既に使用されています。」 |
| 12 | ログアウトして `/` を開く | `/login` へリダイレクトされる |
| 13 | ログイン済みで `/login` を開く | `/` へリダイレクトされる |

- [ ] **Step 3: Supabase Linter で新規の警告がないことを確認**

Supabase MCP の `get_advisors` を security / performance の両方で実行する。
Task 2 で追加した `validate_invite_code` が `anon` から実行可能である旨の
WARN は意図的なので許容する。それ以外の新規 WARN があれば修正する。

- [ ] **Step 4: プッシュして PR を作成**

```bash
git push -u origin feature/auth-invite
gh pr create --base main --title "feat: 認証 & 招待コード機能を実装" --body "$(cat <<'EOF'
README の機能要件A（認証 & 招待コード機能）を実装する。

## 実装内容

- サインアップ / ログイン / ログアウト
- 初回登録特例（ユーザー0人のときのみ招待コード不要、かつ admin として登録）
- 招待コードの発行・表示・コピー・削除
- 再認証ダイアログ（5分間有効）
- middleware によるルート保護

## 設計上の判断

`auth.users` のトリガが送出する例外メッセージは Supabase Auth が
"Database error saving new user" に潰すためクライアントへ届かない。
事前検証 RPC `validate_invite_code` を追加し、signUp の前に理由を判定する
二段構えとした。トリガは TOCTOU 対策として残している。

再認証は persistSession:false の使い捨てクライアントで検証するため、
現在のセッションに影響しない。有効期限はメモリ上のみで保持し、
localStorage や Cookie へは書き込まない。

## 検証

- typecheck / lint / test / build すべてエラーなし
- 設計書 11 章の受け入れ基準 13 項目を手動確認済み
- Supabase Linter に新規の WARN なし

## 設計書

`docs/superpowers/specs/2026-09-10-auth-invite-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: 音声案内を鳴らして人間へ承認を求める**

```bash
say -v Kyoko -r 200 "実装が完了しました。プルリクエストの承認をお願いします。"
```

マージは人間の承認を得てから行う（CLAUDE.md 3章）。
