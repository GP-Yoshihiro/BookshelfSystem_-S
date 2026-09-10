# 認証 & 招待コード機能 設計書

- 作成日: 2026-09-10
- 対象: README.md 「3. 機能要件詳細 A. 認証 & 招待コード機能」
- ブランチ: `feature/auth-invite`
- 前提: PR #1（プロジェクト基盤・DBスキーマ）がマージ済みであること

## 1. 目的

招待制のクローズドな書籍管理システムとして、以下を成立させる。

- DB にユーザーが 1 人も存在しない場合のみ、招待コード無しでサインアップできる
- 2 人目以降は有効な招待コードを持つ者だけがサインアップできる
- 招待コードの発行・コピー・詳細閲覧という機微な操作は、パスワード再入力を経た場合のみ実行できる

## 2. スコープ

### 含むもの

- サインアップ画面（招待コード欄の動的な出し分けを含む）
- ログイン画面 / ログアウト
- 認証状態によるルート保護（middleware）
- 招待コード管理画面（発行・一覧・コピー）
- 再認証ダイアログ
- 上記に必要な DB マイグレーション `0003`
- 音声案内の組み込み（ヒアリング／再認証／処理完了）

### 含まないもの

- 本棚 UI、カレンダー、楽天 API 連携（機能 B〜D で扱う）
- パスワードリセット、メールアドレス変更、退会
- 管理者向けのユーザー管理画面

パスワードリセットはメール送信基盤（SMTP）に依存するため、SMTP を導入する段階で別途設計する。それまでは Supabase ダッシュボードからの手動対応とする。

## 3. 前提条件（Supabase ダッシュボード設定）

コードからは変更できないため、実装着手前に手動設定が必要。

| 設定項目 | 値 | 場所 |
| --- | --- | --- |
| Confirm email | **OFF** | Authentication → Sign In / Providers → Email |
| Enable email provider | ON | 同上 |
| Site URL | `http://localhost:3000`（本番は Vercel の URL） | Authentication → URL Configuration |

Confirm email を OFF にする理由は次の 2 点。

1. 招待コードによって入口が既に守られており、メール確認は二重の関門になる
2. 新規 Supabase プロジェクトの組み込み SMTP は送信レート制限が厳しく、確認メールが届かず登録が完了しない事故を招きやすい

将来 SMTP を導入した際は、この設定を ON へ戻し `/auth/callback` ルートを追加する。

## 4. アーキテクチャ

### 4.1 ルーティング

```
src/app/
  (auth)/                          未認証ユーザー向け
    layout.tsx                     中央寄せの簡素なレイアウト
    login/page.tsx
    signup/page.tsx
  (app)/                           認証必須
    layout.tsx                     セッション取得とヘッダー表示
    page.tsx                       本棚（既存の仮ページを移設）
    settings/invites/page.tsx      招待コード管理
```

Route Group を使う理由は、認証の要否でレイアウトが完全に異なるため。URL には `(auth)` `(app)` は現れない。

### 4.2 ディレクトリ構成

```
src/features/auth/
  actions.ts                 Server Actions: signUpAction / signInAction / signOutAction
  messages.ts                Supabase のエラーを日本語表示文言へ変換する純粋関数
  LoginForm.tsx
  SignupForm.tsx
  ReauthProvider.tsx         再認証の有効期限をメモリ上で保持する Context
  ReauthDialog.tsx
  useReauth.ts               requireReauth() を提供するフック

src/features/invites/
  actions.ts                 Server Actions: generateInviteCodeAction / deleteInviteCodeAction
  InviteCodeList.tsx
  GenerateInviteButton.tsx
  format.ts                  有効期限の表示整形など純粋関数

src/lib/supabase/verify.ts   パスワード検証専用の使い捨てクライアント
```

各ファイルは 1 つの責務に絞る。UI コンポーネントは表示とユーザー操作のみを扱い、Supabase の呼び出しは `actions.ts` と `verify.ts` に閉じ込める。

## 5. データフロー

### 5.1 サインアップ

```
[画面表示]
  Server Component が supabase.rpc('has_any_user') を実行
    └─ false → 「最初のユーザー登録」表示。招待コード欄は出さない
    └─ true  → 招待コード欄を必須入力として表示

[送信] signUpAction（Server Action）内で以下を順に実行する
  1. 招待コードが必要な場合、rpc('validate_invite_code', { p_code }) で事前検証
       'not_found' → 「招待コードが正しくありません。」
       'used'      → 「この招待コードは既に使用されています。」
       'expired'   → 「この招待コードは有効期限が切れています。」
       'ok'        → 次へ
  2. supabase.auth.signUp({ email, password, options: { data: { invite_code, display_name } } })
  3. handle_new_user トリガが profiles を作成し、招待コードを使用済みへ更新
  4. 成功 → speakComplete() の後 / へリダイレクト
```

**事前検証を挟む理由**: `auth.users` のトリガが例外を送出すると、Supabase Auth は
`Database error saving new user`（HTTP 500）を返すのみで、`RAISE EXCEPTION` に書いた
日本語メッセージはクライアントへ伝わらない。理由を利用者へ提示するには、
signUp を呼ぶ前に別途検証する必要がある。

トリガは削除せず残す。事前検証と signUp の間に他者が同じコードを使い切る競合
（TOCTOU）が起こり得るため、トリガが最終防波堤として機能する。この競合が起きた場合は
「登録に失敗しました。招待コードをご確認のうえ、もう一度お試しください。」を表示する。

### 5.2 ログイン

`signInAction`（Server Action）が `supabase.auth.signInWithPassword` を呼び、
成功時は `/` へ `redirect()`。Server Action 内で SSR クライアントを使うことで、
セッション Cookie が `httpOnly` 属性付きでサーバー側から設定される。

失敗時は理由を問わず「メールアドレスまたはパスワードが正しくありません。」に統一し、
アカウントの存在有無を推測させない。

### 5.3 ルート保護（middleware）

既存の `updateSession` を拡張する。

| 状態 | 対象パス | 動作 |
| --- | --- | --- |
| 未認証 | `(app)` 配下 | `/login` へリダイレクト |
| 認証済み | `/login`, `/signup` | `/` へリダイレクト |
| いずれも | 静的アセット | 素通し（既存の matcher を維持） |

判定には `supabase.auth.getUser()` の結果を使う。`getSession()` は Cookie の内容を
検証せずに返すため、保護の判断には使わない。

### 5.4 再認証

```
[発行 / コピー / 詳細閲覧 のいずれかを押下]
  useReauth().requireReauth() を呼ぶ
    └─ 直近5分以内に検証成功済み → 即座に処理を実行
    └─ それ以外 → ReauthDialog を開く
                    speakReauth() で「パスワードの再認証が必要です。」を読み上げ
                    パスワード入力 → verifyPassword()
                      成功 → 有効期限を now + 5分 に更新し、保留していた処理を実行
                      失敗 → 「パスワードが正しくありません。」を表示（ダイアログは開いたまま）
```

`verifyPassword()` は `src/lib/supabase/verify.ts` で、
`createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })`
により使い捨てクライアントを生成し `signInWithPassword` を実行する。
`persistSession: false` のため、検証の成否にかかわらず現在のセッション Cookie は
一切書き換わらない。

有効期限は `ReauthProvider` の React state（メモリ）にのみ保持する。
`localStorage` や Cookie には保存しない。タブを閉じれば失効するため、
共有端末でのリスクを抑えられる。

パスワードは入力コンポーネントのローカル state に留め、検証呼び出し後に
空文字でクリアする。Context や Server Action へは渡さない。

### 5.5 招待コードの発行

`generateInviteCodeAction(expiresInDays)` が `rpc('generate_invite_code', { p_expires_in_days })`
を呼ぶ。UI では 無期限 / 1日 / 7日 / 30日 を選択でき、**既定は 7 日**。
発行後は `revalidatePath('/settings/invites')` で一覧を更新し、`speakComplete()` を鳴らす。

## 6. DB マイグレーション 0003

```sql
create or replace function public.validate_invite_code(p_code text)
returns text
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_invite public.invite_codes%rowtype;
begin
  if nullif(trim(p_code), '') is null then
    return 'not_found';
  end if;

  select * into v_invite
  from public.invite_codes
  where code = trim(p_code);

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

revoke all on function public.validate_invite_code(text) from public, authenticated;
grant execute on function public.validate_invite_code(text) to anon;
```

**設計上の注意**

- 戻り値は状態を表す固定文字列のみ。発行者・発行日時・使用者などの情報は返さない
- `anon` にのみ EXECUTE を与える。サインアップ前の未認証状態から呼ぶための関数であり、
  認証済みユーザーが呼ぶ必要はない
- この関数は総当たりでコードの有効性を判定できてしまうため、
  コードは `generate_invite_code` が生成する 12 桁（紛らわしい文字を除外済み）を維持する。
  将来的にレート制限が必要になった場合は Supabase の Edge Function 側で対処する

## 7. エラーハンドリングと表示文言

`src/features/auth/messages.ts` に、Supabase のエラーを日本語へ変換する純粋関数を置く。

| 状況 | 表示文言 |
| --- | --- |
| ログイン失敗（原因を問わず） | メールアドレスまたはパスワードが正しくありません。 |
| メールアドレスが登録済み | このメールアドレスは既に登録されています。 |
| パスワードが短い | パスワードは8文字以上で入力してください。 |
| 招待コード未入力 | 招待コードを入力してください。 |
| 招待コード不正 / 使用済み / 期限切れ | 5.1 の各文言 |
| signUp が 500 を返した | 登録に失敗しました。招待コードをご確認のうえ、もう一度お試しください。 |
| 再認証の失敗 | パスワードが正しくありません。 |
| 想定外の失敗 | 処理に失敗しました。時間をおいて再度お試しください。 |

`console.error(error)` のようにエラーオブジェクトをそのまま出力してはならない
（CLAUDE.md 2章）。Supabase のエラーには入力値やトークンの断片が含まれ得るため、
表示用文言へ変換した後の文字列のみを扱う。

## 8. セキュリティ

- ログイン・サインアップのパスワードは Server Action へ送る。セッション Cookie を
  `httpOnly` でサーバー側から設定するために必要な経路であり、通信は HTTPS で保護される。
  受け取ったパスワードは Supabase Auth への呼び出しにのみ使い、変数へ保持し続けない。
  ログ・エラーメッセージ・`revalidatePath` の引数など、いかなる出力にも含めない
- 再認証のパスワードは例外的にブラウザ内で完結させる。使い捨てクライアントで検証するため
  サーバーを経由する必要がなく、経由させない方が漏洩面が小さい
- 再認証の有効状態はメモリのみ。永続化しない
- 招待コードの一覧は RLS `invite_codes_select_own` により発行者本人と管理者のみ取得可能
- ロールの自己昇格は `prevent_role_escalation` トリガで既に防止済み
- 認証エラー文言を統一し、アカウント列挙を防ぐ

## 9. 音声案内（CLAUDE.md 5章）

既存の `src/lib/speech.ts` を使用する。新規実装は不要。

| タイミング | 呼び出し |
| --- | --- |
| 再認証ダイアログの表示 | `speakReauth()` |
| サインアップ成功 / 招待コード発行成功 | `speakComplete()` |
| 上記の処理が失敗 | `speakError()` |

ログイン成功時は鳴らさない。日常的に最も頻度が高く、毎回の読み上げは煩わしいため。

## 10. テスト戦略

Vitest と @testing-library/react を導入し、純粋関数と表示ロジックを対象にテストを書く。

| 対象 | 内容 |
| --- | --- |
| `features/auth/messages.ts` | 各エラーが期待どおりの日本語文言へ変換されること |
| `features/auth/useReauth.ts` | 5分以内は再入力不要、5分超過で再入力要求となること |
| `features/invites/format.ts` | 有効期限の表示整形、期限切れ判定 |

Supabase への通信を伴う処理（Server Actions、`verify.ts`）は、モックの維持コストが
実装の変更に見合わないため自動テストの対象外とし、開発サーバーでの手動確認とする。
確認手順は実装計画に列挙する。

## 11. 受け入れ基準

1. ユーザーが 0 人の状態で `/signup` を開くと招待コード欄が表示されず、登録できる。
   登録されたユーザーの `profiles.role` が `admin` である
2. 1 人以上いる状態で `/signup` を開くと招待コード欄が必須で表示される
3. 誤った / 使用済み / 期限切れの招待コードでは、それぞれ固有の日本語エラーが表示され、
   ユーザーは作成されない
4. 有効な招待コードで登録でき、当該コードの `is_used` が `true`、`used_by` が
   登録ユーザーの ID になる
5. 未認証で `/` を開くと `/login` へリダイレクトされる
6. 認証済みで `/login` を開くと `/` へリダイレクトされる
7. `/settings/invites` で発行ボタンを押すと再認証ダイアログが開き、音声案内が鳴る
8. 正しいパスワードで再認証すると招待コードが発行され、一覧に表示される
9. 発行から 5 分以内の再操作では再認証を求められない
10. 誤ったパスワードでは再認証に失敗し、招待コードは発行されない
11. `npm run typecheck` / `lint` / `build` / `test` がすべてエラーなく完了する
12. Supabase Database Linter に新規の WARN が増えていない
