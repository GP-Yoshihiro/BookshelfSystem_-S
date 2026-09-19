'use client';

import { useState } from 'react';
import { groupBySeries, splitExcluded } from './grouping';
import { SeriesRow } from './SeriesRow';
import { SingleBookRow } from './SingleBookRow';
import type { RakutenBookItem } from './types';

/**
 * 検索結果の一覧。
 *
 * 同じ作品の巻がばらばらに並ぶと目的の本を探しにくいため、作品単位へ
 * まとめる。1件しかない作品と、巻数を抽出できない商品は従来どおり
 * 1商品1行で表示する。
 */
export function SearchResults({
  items,
  ownedIsbns,
  alertIds,
}: {
  items: readonly RakutenBookItem[];
  ownedIsbns: ReadonlySet<string>;
  /** 発売日アラートの series_key → alertId。解除に alertId が要る */
  alertIds: ReadonlyMap<string, string>;
}) {
  const [showsExcluded, setShowsExcluded] = useState(false);

  if (items.length === 0) {
    return (
      <p className="text-sm text-wood-200">
        該当する書籍が見つかりませんでした。
      </p>
    );
  }

  const { kept, excluded } = splitExcluded(items);
  const groups = groupBySeries(kept);

  return (
    <div className="space-y-4">
      {excluded.length > 0 && (
        <div className="rounded bg-wood-800 p-3 text-sm text-wood-200">
          <button
            type="button"
            onClick={() => setShowsExcluded((current) => !current)}
            aria-expanded={showsExcluded}
            className="underline"
          >
            他 {excluded.length} 件（セット商品など）を除外中
            {showsExcluded ? '：閉じる' : '：表示する'}
          </button>

          {showsExcluded && (
            <ul className="mt-2 space-y-2">
              {excluded.map((item) => (
                <SingleBookRow
                  key={item.isbn}
                  item={item}
                  alreadyOwned={ownedIsbns.has(item.isbn)}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      <ul className="space-y-4">
        {groups.map((group) =>
          group.isSingle ? (
            <SingleBookRow
              key={group.key}
              item={group.representative}
              alreadyOwned={ownedIsbns.has(group.representative.isbn)}
            />
          ) : (
            <SeriesRow
              key={group.key}
              group={group}
              ownedIsbns={ownedIsbns}
              alertIds={alertIds}
            />
          ),
        )}
      </ul>
    </div>
  );
}
