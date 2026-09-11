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
