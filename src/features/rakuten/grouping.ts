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
