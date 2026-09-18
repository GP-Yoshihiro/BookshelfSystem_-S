'use client';

import Image from 'next/image';
import { estimateCategory, isOngoingByDefault, parseSalesDate } from './parse';
import { SaveBookForm } from './SaveBookForm';
import type { RakutenBookItem } from './types';

/** 1商品ぶんの行。シリーズにまとまらない商品に使う */
export function SingleBookRow({
  item,
  alreadyOwned,
}: {
  item: RakutenBookItem;
  alreadyOwned: boolean;
}) {
  const category = estimateCategory(item);
  const sales = parseSalesDate(item.salesDate);

  return (
    <li className="flex gap-4 rounded bg-wood-800 p-3 shadow-book">
      {item.largeImageUrl.length > 0 && (
        <Image
          src={item.largeImageUrl}
          alt=""
          width={80}
          height={112}
          unoptimized
          className="h-28 w-20 flex-none object-contain"
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
          alreadyOwned={alreadyOwned}
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
            defaultIsOngoing: isOngoingByDefault(item.seriesName, category),
          }}
        />
      </div>
    </li>
  );
}
