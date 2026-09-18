import Image from 'next/image';
import type { RakutenBookItem } from './types';
import {
  estimateCategory,
  isOngoingByDefault,
  parseSalesDate,
} from './parse';
import { SaveBookForm } from './SaveBookForm';

/**
 * 検索結果の一覧。Server Component。
 * ownedIsbns は本棚に既にある ISBN の集合。
 */
export function SearchResults({
  items,
  ownedIsbns,
}: {
  items: readonly RakutenBookItem[];
  ownedIsbns: ReadonlySet<string>;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-wood-200">
        該当する書籍が見つかりませんでした。
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {items.map((item) => {
        const category = estimateCategory(item);
        const sales = parseSalesDate(item.salesDate);
        return (
          <li
            key={item.isbn}
            className="flex gap-4 rounded bg-wood-800 p-3 shadow-book"
          >
            {item.largeImageUrl.length > 0 && (
              <Image
                src={item.largeImageUrl}
                alt=""
                width={80}
                height={112}
                className="h-28 w-20 flex-none object-contain"
                unoptimized
              />
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-bold text-wood-50">{item.title}</p>
              <p className="text-sm text-wood-200">
                {item.author}／{item.publisherName}
              </p>
              {sales.text.length > 0 && (
                <p className="text-sm text-wood-300">発売日 {sales.text}</p>
              )}
              <SaveBookForm
                alreadyOwned={ownedIsbns.has(item.isbn)}
                values={{
                  isbn: item.isbn,
                  title: item.title,
                  titleKana: item.titleKana,
                  author: item.author,
                  publisher: item.publisherName,
                  coverImageUrl: item.largeImageUrl,
                  description: item.itemCaption,
                  releaseDate: sales.date ?? '',
                  releaseDateText: sales.text,
                  itemUrl: item.itemUrl,
                  defaultCategory: category,
                  defaultIsOngoing: isOngoingByDefault(
                    item.seriesName,
                    category,
                  ),
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
