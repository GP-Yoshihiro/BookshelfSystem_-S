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
