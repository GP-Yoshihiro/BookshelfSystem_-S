/**
 * 本棚のソート・絞り込み・検索を行う純粋関数。
 *
 * すべてブラウザ側で処理する。README が求めるリアルタイム検索を
 * 体感ゼロで実現でき、Supabase へのリクエストも増えないため。
 *
 * どの関数も入力の配列を書き換えない。React の state をそのまま
 * 渡すため、破壊すると再描画が壊れる。
 */

// 巻数の切り出しは検索側と同じ規則を使う。ここで別の規則を作ると、
// 検索でまとまった作品が本棚ではばらける、という食い違いが起きる
import { parseVolume, seriesKey } from '@/features/rakuten/series';
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
}

/** 何も絞り込まない状態 */
export const EMPTY_FILTERS: BookFilters = {
  categories: [],
  publishers: [],
  onlyOngoing: false,
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

/**
 * 作品（シリーズ）を見分けるキー。
 *
 * 巻数は必ず title から取る。title_kana は楽天の登録がまちまちで、
 * 「トンガリボウシノアトリエ10」のように区切りなしで数字が付くもの、
 * 「ジュジュツカイセン」のように全巻同じもの、
 * 「テンセイシタラスライムダッタケンジュウキュウ」のように巻数が
 * カナで綴られるものが混在する。カナから巻数は読み取れない。
 *
 * 分類と出版社もキーに含める。同じ「転生したらスライムだった件」でも
 * マイクロマガジン社のライトノベルと講談社のコミックスは別作品であり、
 * 混ぜて巻数順に並べると別物の巻が交互に現れる。実データで起きている。
 *
 * 本編とスピンオフは作品名の時点で分かれる。「転生したらスライムだった件」と
 * 「転生したらスライムだった件 異聞 〜魔国暮らしのトリニティ〜」は
 * 巻数を剥がした作品名が異なるため、別の作品になる。
 */
function workKey(target: Book): string {
  const base = seriesKey(parseVolume(target.title).baseTitle);
  return `${base}\u0000${target.category}\u0000${target.publisher}`;
}

/**
 * 作品を五十音順に並べるための文字列。
 *
 * localeCompare('ja') は漢字を読みで並べない（実測で確認済み）。
 * 「とんがり帽子」が「薫る花」より前に来てしまうため、五十音順には
 * カナが要る。カナが無い本はタイトル本体で代用する。並びは乱れるが、
 * カナの無いものを末尾へ固めて本が行方不明になるよりは良い。
 *
 * カナ末尾の数字は落とす。残すと「…アトリエ10」が「…アトリエ2」より
 * 前に来て、作品どうしの順序が巻数に引きずられる。
 */
function workSortKana(target: Book): string {
  const kana = target.title_kana?.trim() ?? '';
  if (kana.length === 0) {
    return parseVolume(target.title).baseTitle;
  }
  const withoutVolume = kana.replace(/[0-9０-９]+$/, '').trim();
  return withoutVolume.length > 0 ? withoutVolume : kana;
}

/** 分類の並び順での位置。未知の分類は末尾へ回す */
function categoryIndex(target: Book): number {
  const index = CATEGORY_SORT_ORDER.indexOf(target.category);
  return index < 0 ? CATEGORY_SORT_ORDER.length : index;
}

/** 同じ作品の中での並び。1, 2, …, 9, 10, 11 と数値で並べる */
function compareWithinWork(left: Book, right: Book): number {
  const leftVolume = parseVolume(left.title).volume;
  const rightVolume = parseVolume(right.title).volume;

  // 巻数を取り出せない本（セット商品など）は作品の末尾へ置く
  if (leftVolume === null && rightVolume !== null) {
    return 1;
  }
  if (leftVolume !== null && rightVolume === null) {
    return -1;
  }
  if (leftVolume !== null && rightVolume !== null && leftVolume !== rightVolume) {
    return leftVolume - rightVolume;
  }

  return compareJa(titleSortKey(left), titleSortKey(right));
}

interface Work {
  books: Book[];
  /** 五十音順に使う代表のカナ。最小巻のものを採る */
  sortKana: string;
  categoryIndex: number;
  publisher: string;
}

/**
 * 作品ごとにまとめる。
 *
 * 比較関数だけで済ませられないのは、五十音順に使うカナが巻ごとに
 * 違うことがあるため（「…ダッタケンジュウキュウ」など）。作品を先に
 * まとめ、代表のカナを1つ決めてから作品どうしを比べる必要がある。
 */
function groupIntoWorks(books: readonly Book[]): Work[] {
  const works = new Map<string, Work>();

  for (const target of books) {
    const key = workKey(target);
    const existing = works.get(key);
    if (existing === undefined) {
      works.set(key, {
        books: [target],
        sortKana: workSortKana(target),
        categoryIndex: categoryIndex(target),
        publisher: target.publisher,
      });
      continue;
    }
    existing.books.push(target);
  }

  for (const work of works.values()) {
    work.books.sort(compareWithinWork);
    // 代表のカナは最小巻のもの。巻ごとにカナが違う作品でも1つに定まる
    const first = work.books[0];
    if (first !== undefined) {
      work.sortKana = workSortKana(first);
    }
  }

  return [...works.values()];
}

/** 作品どうしを五十音・分類・出版社の順に比べる */
function compareWorksByName(left: Work, right: Work): number {
  const byKana = compareJa(left.sortKana, right.sortKana);
  if (byKana !== 0) {
    return byKana;
  }
  const byCategory = left.categoryIndex - right.categoryIndex;
  if (byCategory !== 0) {
    return byCategory;
  }
  return compareJa(left.publisher, right.publisher);
}

export function sortBooks(
  books: readonly Book[],
  key: SortKey,
  order: SortOrder,
): Book[] {
  const works = groupIntoWorks(books);

  works.sort((left, right) => {
    if (key === 'category') {
      const byCategory = left.categoryIndex - right.categoryIndex;
      if (byCategory !== 0) {
        return byCategory;
      }
    }
    if (key === 'publisher') {
      const byPublisher = compareJa(left.publisher, right.publisher);
      if (byPublisher !== 0) {
        return byPublisher;
      }
    }
    return compareWorksByName(left, right);
  });

  const sorted = works.flatMap((work) => work.books);
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
