import 'server-only';

import type { RakutenBookItem, RakutenSearchSuccess } from './types';

const ENDPOINT =
  'https://app.rakuten.co.jp/services/api/BooksBook/Search/20170404';

/** 1ページあたりの取得件数。楽天APIの上限は 30 */
const HITS_PER_PAGE = 30;

/**
 * .env.local.example に記載されているプレースホルダ文字列。
 *
 * .env.local.example をコピーして .env.local を作った際、この値を
 * 書き換えずに残すと「空文字ではない」ため設定済みと誤判定されてしまう。
 * その結果、無効なIDのまま楽天APIへリクエストが送られ、開発者には
 * 原因の分からない「検索に失敗しました」というエラーだけが見える。
 * これを防ぐため、既知のプレースホルダは明示的に未設定として扱う。
 */
const PLACEHOLDER_APP_ID = 'your-rakuten-application-id';
const PLACEHOLDER_ACCESS_KEY = 'your-rakuten-access-key';

/**
 * 楽天ウェブサービスのアプリIDが設定されているか。
 *
 * 環境変数を必須として読む関数は未設定だと例外を投げるため、判定には使えない。
 * ここでは値そのものを返さず、設定の有無だけを返す。
 */
function isUsableValue(value: unknown, placeholder: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== placeholder;
}

/**
 * 楽天ウェブサービスの認証情報が揃っているか。
 *
 * 2026年の仕様変更により applicationId と accessKey が対で必須になった。
 * 片方だけでは API が wrong_parameter を返すため、両方揃って初めて
 * 「設定済み」とみなす。
 */
export function isRakutenConfigured(): boolean {
  return (
    isUsableValue(process.env.RAKUTEN_APP_ID, PLACEHOLDER_APP_ID) &&
    isUsableValue(process.env.RAKUTEN_ACCESS_KEY, PLACEHOLDER_ACCESS_KEY)
  );
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
  const accessKey = process.env.RAKUTEN_ACCESS_KEY ?? '';
  if (appId.length === 0 || accessKey.length === 0) {
    throw new Error('RAKUTEN_CREDENTIALS_NOT_CONFIGURED');
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set('applicationId', appId);
  // 2026年の仕様変更で必須になった。ヘッダーでも渡せるがヘッダー名が
  // 公開仕様に明記されていないため、確実なクエリパラメータで送る。
  // URL は例外・ログのいずれにも出力しないため、値が漏れる経路はない。
  url.searchParams.set('accessKey', accessKey);
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

  let body: unknown;
  try {
    // JSON パース失敗時に応答本文の断片が例外メッセージへ漏れるため、
    // 固定の識別子のみを持つ例外へ丸める
    body = await response.json();
  } catch {
    throw new Error('RAKUTEN_INVALID_JSON');
  }
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
