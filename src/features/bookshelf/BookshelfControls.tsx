'use client';

import {
  CATEGORY_SORT_ORDER,
  type BookFilters,
  type SortKey,
  type SortOrder,
} from './filters';
import { BOOK_CATEGORY_LABELS, type BookCategory } from '@/types/database';

const SORT_LABELS: Readonly<Record<SortKey, string>> = {
  category: '分類別',
  publisher: '出版社別',
  title: 'タイトル五十音順',
};

export function BookshelfControls({
  query,
  onQueryChange,
  sortKey,
  onSortKeyChange,
  sortOrder,
  onSortOrderChange,
  filters,
  onFiltersChange,
  publishers,
  shownCount,
  totalCount,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  sortKey: SortKey;
  onSortKeyChange: (value: SortKey) => void;
  sortOrder: SortOrder;
  onSortOrderChange: (value: SortOrder) => void;
  filters: BookFilters;
  onFiltersChange: (value: BookFilters) => void;
  publishers: readonly string[];
  shownCount: number;
  totalCount: number;
}) {
  function toggleCategory(category: BookCategory) {
    const next = filters.categories.includes(category)
      ? filters.categories.filter((item) => item !== category)
      : [...filters.categories, category];
    onFiltersChange({ ...filters, categories: next });
  }

  function togglePublisher(publisher: string) {
    const next = filters.publishers.includes(publisher)
      ? filters.publishers.filter((item) => item !== publisher)
      : [...filters.publishers, publisher];
    onFiltersChange({ ...filters, publishers: next });
  }

  return (
    <div className="space-y-3 rounded bg-wood-800 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <label htmlFor="shelf-search" className="block text-xs text-wood-200">
            本棚内を検索（タイトル・著者・出版社）
          </label>
          <input
            id="shelf-search"
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            className="mt-1 w-full rounded border border-wood-300 bg-wood-50 px-3 py-2 text-wood-900"
          />
        </div>

        <div>
          <label htmlFor="shelf-sort" className="block text-xs text-wood-200">
            並び替え
          </label>
          <select
            id="shelf-sort"
            value={sortKey}
            onChange={(event) => onSortKeyChange(event.target.value as SortKey)}
            className="mt-1 rounded border border-wood-300 bg-wood-50 px-2 py-2 text-wood-900"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc')}
          aria-label={sortOrder === 'asc' ? '昇順。押すと降順' : '降順。押すと昇順'}
          className="rounded border border-wood-400 px-3 py-2 text-sm text-wood-100"
        >
          {sortOrder === 'asc' ? '昇順 ↑' : '降順 ↓'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORY_SORT_ORDER.map((category) => (
          <button
            key={category}
            type="button"
            aria-pressed={filters.categories.includes(category)}
            onClick={() => toggleCategory(category)}
            className={`rounded-full px-3 py-1 text-xs ${
              filters.categories.includes(category)
                ? 'bg-wood-500 text-wood-50'
                : 'bg-wood-700 text-wood-200'
            }`}
          >
            {BOOK_CATEGORY_LABELS[category]}
          </button>
        ))}

        {publishers.map((publisher) => (
          <button
            key={publisher}
            type="button"
            aria-pressed={filters.publishers.includes(publisher)}
            onClick={() => togglePublisher(publisher)}
            className={`rounded-full px-3 py-1 text-xs ${
              filters.publishers.includes(publisher)
                ? 'bg-wood-500 text-wood-50'
                : 'bg-wood-700 text-wood-200'
            }`}
          >
            {publisher}
          </button>
        ))}

        <button
          type="button"
          aria-pressed={filters.onlyOngoing}
          onClick={() =>
            onFiltersChange({ ...filters, onlyOngoing: !filters.onlyOngoing })
          }
          className={`rounded-full px-3 py-1 text-xs ${
            filters.onlyOngoing
              ? 'bg-wood-500 text-wood-50'
              : 'bg-wood-700 text-wood-200'
          }`}
        >
          連載中
        </button>
      </div>

      <p className="text-xs text-wood-300" role="status">
        {shownCount} / {totalCount} 冊を表示
      </p>
    </div>
  );
}
