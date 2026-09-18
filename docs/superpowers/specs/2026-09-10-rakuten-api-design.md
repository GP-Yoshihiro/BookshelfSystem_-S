# 楽天ブックスAPI連携 & キャッシュ 設計書

- 作成日: 2026-09-10
- 対象: README.md 「3. 機能要件詳細 D. 外部API連携 & キャッシュ」
- ブランチ: `feature/rakuten-api`
- 前提: PR #2（認証 & 招待コード）がマージ済みであること

## 1. 目的

楽天ブックス書籍検索APIから書籍情報を取得し、利用者が自分の本棚へ登録できるようにする。
併せて、Supabase への過剰なリクエストを抑えるサーバーキャッシュを構築する。

この工程は工程B（木製本棚UI）が表示するデータの供給源になる。B より先に実装するのは、
表示対象のデータが存在しない状態で UI を作ると手戻りが大きいため。

## 2. スコープ

### 含むもの

- 書籍検索画面（キーワード検索）
- 楽天ブックスAPIクライアント（サーバー側専用）
- 分類の自動推定と手動修正
- 発売日文字列の解析
- 本棚への保存（購入済み / 未購入）
- `unstable_cache` / `revalidateTag` によるサーバーキャッシュ
- マイグレーション `0006`（`books.release_date_text` の追加）

### 含まないもの

- 最新巻の自動追跡（シリーズ名で再検索して発売日を更新する機能）
- 木製本棚UI、カレンダー（工程 B / C で扱う）
- 書籍詳細ページ（工程 B で扱う）
- 楽天アフィリエイトリンクの生成（環境変数の枠だけ用意済み）

## 3. 前提条件

`RAKUTEN_APP_ID` の取得が必要。https://webservice.rakuten.co.jp/ でアプリを登録すると
`applicationId` が発行される。`.env.local` へ設定するまで、実APIを叩く動作確認はできない。

実装とテストは実APIなしで進められる（後述のとおり純粋関数を分離し、通信部分は
手動確認に回すため）。

## 4. 楽天ブックス書籍検索API

### 4.1 エンドポイント

```
GET https://app.rakuten.co.jp/services/api/BooksBook/Search/20170404
```

主なクエリパラメータ:

| パラメータ | 用途 |
| --- | --- |
| `applicationId` | 必須。サーバー側でのみ付与する |
| `keyword` | フリーワード検索 |
| `isbn` | ISBN 指定検索 |
| `hits` | 1ページあたり件数（最大 30） |
| `page` | ページ番号（1 起点） |
| `sort` | 並び順（既定は標準） |
| `formatVersion` | `2` を指定し、`Items` を素の配列で受け取る |

`formatVersion=2` を指定する理由は、既定（`1`）だと `Items: [{ Item: {...} }]` と
一段深くなるため。`2` なら `Items: [{...}]` になり、変換処理が減る。

### 4.2 利用するレスポンスフィールド

| フィールド | 用途 |
| --- | --- |
| `isbn` | `books.isbn`。一意キー |
| `title` | `books.title` |
| `titleKana` | `books.title_kana`（五十音順ソート用） |
| `author` | `books.author` |
| `publisherName` | `books.publisher` |
| `size` | 分類推定（「コミック」「文庫」「単行本」等） |
| `booksGenreId` | 分類推定（ライトノベル判定） |
| `seriesName` | 分類推定・連載中フラグの既定値 |
| `salesDate` | 発売日。表記揺れあり（後述） |
| `itemCaption` | `books.description` |
| `largeImageUrl` | `books.cover_image_url` |
| `itemUrl` | `books.item_url` |

### 4.3 レート制限と扱い

楽天ウェブサービスは 1 秒あたり 1 リクエスト程度を上限として案内している。
本システムは個人利用かつキャッシュを挟むため通常は抵触しないが、以下を守る。

- 検索は利用者の明示操作でのみ発火させる。入力のたびに自動で叩かない
- 同一クエリはキャッシュから返す（後述）
- API がエラーを返した場合は日本語文言へ変換して表示し、リトライを自動で繰り返さない

### 4.4 APP_ID 未設定時の扱い

`src/lib/env.ts` の `getServerEnv()` は環境変数が未設定だと例外を送出する。
これを検索画面からそのまま呼ぶと、キー未設定の開発者にはエラー画面が出るだけで
何をすればよいか分からない。

そこで楽天クライアント側に、例外を投げない確認関数を用意する。

```ts
/** APP_ID が設定されているか。値そのものは返さない */
export function isRakutenConfigured(): boolean
```

検索画面はまずこれを呼び、`false` なら検索フォームを出さずに
「楽天ウェブサービスのアプリIDが未設定です。`.env.local` に `RAKUTEN_APP_ID` を
設定してください。」と案内する。値そのものは画面にも例外メッセージにも出さない。

## 5. 分類の推定

楽天APIは本システムの4分類（単行本 / シリーズ単行本 / ライトノベル / コミック）を
そのまま返さない。以下の順に評価し、最初に一致した分類を採用する。

| 優先 | 条件 | 分類 |
| --- | --- | --- |
| 1 | `size` が「コミック」 | `comic` |
| 2 | `booksGenreId` がライトノベルのジャンル配下 | `light_novel` |
| 3 | `seriesName` が空でない | `series_tankobon` |
| 4 | 上記以外 | `tankobon` |

### 5.1 ライトノベルのジャンルIDについて（未確定事項の扱い）

手順2で使うジャンルIDの正確な値は、実APIのレスポンスを確認するまで確定できない。
推測値をコードへ直接埋め込むことはせず、`LIGHT_NOVEL_GENRE_PREFIXES` という
定数として `parse.ts` の先頭に**1箇所へ集約**する。実装時に実APIで検証し、
確定した値を入れる。

検証できないまま実装が進む場合も、定数は空配列にせず暫定値を入れたうえで
「実APIで未検証」であることをコメントに明記する。判定が外れても手動修正で
救えるため、機能全体は成立する。

### 5.2 手動修正

保存時のダイアログで分類をプルダウン選択でき、自動推定値が初期値として入る。
利用者が変更した場合はその値を保存する。

## 6. 発売日の解析

### 6.1 表記の揺れ

`salesDate` は確定日だけでなく、以下のような曖昧な表記を返す。

```
2026年09月10日     確定日
2026年09月頃       月のみ・不確定
2026年秋           季節のみ
2026年09月上旬     旬のみ
2026年             年のみ
（空文字）          未定
```

### 6.2 方針

`parseSalesDate(salesDate: string)` を純粋関数として実装し、次を返す。

```ts
{ date: string | null; text: string }
```

- `date`: `YYYY-MM-DD` 形式。**確定日を特定できたときのみ**値を入れる。
  それ以外は `null`
- `text`: 受け取った原文をそのまま返す（空文字なら空文字）

曖昧な表記を「その月の1日」などと解釈しない。カレンダー（工程C）に
実在しない予定を作ってしまうため。表示は `text` を使えばよく、情報も失われない。

## 7. マイグレーション 0006

```sql
alter table public.books
  add column if not exists release_date_text text;

comment on column public.books.release_date_text is
  '楽天APIの salesDate 原文。「2026年秋」のような確定できない表記を保持する';
```

| カラム | 用途 |
| --- | --- |
| `latest_release_date` (`date`) | カレンダー予約・並び替え。確定日のみ |
| `release_date_text` (`text`) | 画面表示。原文をそのまま保持 |

既存行は `null` になるが、現時点で `books` は 0 件のため影響はない。

## 8. キャッシュ設計

README が求める `unstable_cache` / `revalidateTag` を用いる。

| 対象 | キー | 有効期限 | 無効化 |
| --- | --- | --- | --- |
| 楽天API検索結果 | `['rakuten-search', keyword, page]` | 3600 秒 | タグ `rakuten-search` |
| 本棚一覧 | `['user-books', userId]` | なし | タグ `books:<userId>` |

キーとタグの生成は文字列を直接組み立てず、次の純粋関数に集約する。
散らばると 8.1 の規則2（キーに `userId` を含める）が守られたか確認できなくなるため。

```ts
export function userBooksCacheKey(userId: string): string[]   // ['user-books', userId]
export function userBooksCacheTag(userId: string): string     // 'books:<userId>'
```

保存・更新・削除の Server Action は `revalidateTag(userBooksCacheTag(userId))` を呼ぶ。

### 8.1 ★この設計の最大のリスク★

`unstable_cache` に渡す関数の内部では `cookies()` を読めない。したがって本棚一覧の
取得は、セッションを引き継ぐ通常のクライアントではなく **RLS を迂回する
`createAdminClient()`** を使い、`user_id` で明示的に絞り込む形になる。

つまり **RLS による保護が外れ、`userId` の正しさだけが唯一の防壁になる**。

これを守るための規則を置く。

1. `userId` は必ずキャッシュの**外側**で `supabase.auth.getUser()` から取得したものを渡す。
   リクエストパラメータや props から受け取った値を渡してはならない
2. キャッシュキーに必ず `userId` を含める。含めないと利用者間でキャッシュが共有される
3. クエリには必ず `.eq('user_id', userId)` を付ける
4. 上記3点をテストで固定する（キーに userId が含まれること、クエリに絞り込みが
   あることを検証する）

この関数は他人の本棚を漏らしうる唯一の箇所なので、レビュー時もここを最重点で見る。

## 9. データフロー

### 9.1 検索

```
[/search 画面]
  利用者がキーワードを入力して「検索」を押す（入力のたびには叩かない）
    ↓
  Server Component が getCachedRakutenSearch(keyword, page) を呼ぶ
    ↓ キャッシュヒットならそれを返す
    ↓ ミスなら楽天APIへ1回だけリクエスト
  各件について estimateCategory() と parseSalesDate() を適用して表示用に整形
    ↓
  既に本棚にある ISBN は「追加済み」と表示し、追加ボタンを無効化
```

### 9.2 保存

```
[検索結果の「本棚に追加」/「購入済みとして追加」を押す]
  分類プルダウン（自動推定が初期値）と連載中トグル（シリーズ名があればオン）を表示
    ↓
  saveBookAction が books へ INSERT
    is_purchased: 押したボタンに応じて false / true
    purchased_at: 購入済みのときのみ now()
    ↓
  UNIQUE(user_id, isbn) 違反なら「この本は既に本棚にあります。」を表示
    ↓
  成功したら revalidateTag('books:' + userId) と speakComplete()
```

## 10. セキュリティ

- `RAKUTEN_APP_ID` はサーバー側でのみ参照する。`NEXT_PUBLIC_` を付けない。
  API 呼び出しは Server Component / Server Action からのみ行い、
  ブラウザから楽天APIを直接叩かない
- 楽天APIのレスポンスは外部由来のデータとして扱う。`itemCaption` 等を
  `dangerouslySetInnerHTML` で描画しない
- 画像は `next.config.ts` の `remotePatterns` で許可済みホストからのみ読み込む
- エラーオブジェクトをそのまま出力しない。表示用の日本語文言へ変換する
- 8.1 の規則を厳守する

## 11. 音声案内（CLAUDE.md 5章）

既存の `src/lib/speech.ts` を使う。

| タイミング | 呼び出し |
| --- | --- |
| 本棚への保存に成功 | `speakComplete()` |
| 保存に失敗 / 検索に失敗 | `speakError()` |

検索成功時は鳴らさない。頻度が高く、毎回の読み上げは煩わしいため。

## 12. テスト戦略

`parse.ts` を純粋関数として切り出し、Vitest で検証する。

| 対象 | 内容 |
| --- | --- |
| `parseSalesDate` | 確定日 / 月のみ / 「頃」/ 季節 / 年のみ / 空文字 / 不正値 |
| `estimateCategory` | 4分類すべて。優先順位が守られること（コミックかつシリーズ名ありなど） |
| `isOngoingByDefault` | シリーズ名の有無による既定値 |
| `userBooksCacheKey` | `userId` が必ず含まれること（8.1 の規則2の固定） |
| `userBooksCacheTag` | `userId` ごとに異なるタグになること |
| `isRakutenConfigured` | 未設定・空文字で `false`、設定済みで `true`。値そのものを返さないこと |

楽天APIへの実通信と Supabase への書き込みは、モックの維持コストが実装の変更に
見合わないため自動テストの対象外とし、実APIキー設定後の手動確認とする。
確認手順は実装計画に列挙する。

## 13. 受け入れ基準

1. `/search` でキーワード検索すると楽天APIの結果が一覧表示される
2. 同じキーワードで再検索すると、楽天APIを再度叩かずキャッシュから返る
3. コミックが `comic`、シリーズ名のある本が `series_tankobon`、
   それ以外が `tankobon` と推定される
4. 保存ダイアログで分類を変更でき、変更した値が保存される
5. 「本棚に追加」で `is_purchased = false`、`purchased_at` が `null` の行が作られる
6. 「購入済みとして追加」で `is_purchased = true`、`purchased_at` に値が入る
7. 確定日の書籍は `latest_release_date` に日付が入り、
   「2026年秋」のような書籍は `null` かつ `release_date_text` に原文が入る
8. 既に本棚にある ISBN は「追加済み」と表示され、追加ボタンが無効になる
9. 保存後に本棚のデータが即座に更新される（`revalidateTag` が効いている）
10. 別ユーザーでログインすると、他人の本を含まない自分の本棚だけが返る
11. `RAKUTEN_APP_ID` が未設定のとき、画面が壊れずに設定を促す文言が出る
12. `npm run typecheck` / `lint` / `build` / `test` がすべてエラーなく完了する
13. Supabase Database Linter に新規の WARN が増えていない

基準 10 は 8.1 のリスクに対応する。**実際に2アカウントで確認すること。**
