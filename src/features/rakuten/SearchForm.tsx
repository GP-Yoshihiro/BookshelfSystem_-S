'use client';

import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { suggestBooksAction } from './actions';
import {
  shouldSuggest,
  SUGGEST_DEBOUNCE_MS,
} from './suggest';

/**
 * 検索フォーム。
 *
 * 入力が止まってから一定時間後に候補を取りに行く。1文字ごとに叩くと
 * 楽天のレート制限（毎秒1リクエスト程度）に抵触する恐れがあるため。
 * 候補の取得には本検索と同じキャッシュを使うので、候補を出したあとに
 * 検索を実行しても楽天へ再送されない。
 *
 * 初期値は useSearchParams ではなく props で受け取る。useSearchParams は
 * Suspense 境界を要求することがあり、ページ側が既に値を持っているため。
 */
export function SearchForm({ initialKeyword }: { initialKeyword: string }) {
  const router = useRouter();
  const [keyword, setKeyword] = useState(initialKeyword);
  const [suggestions, setSuggestions] = useState<readonly string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const listboxId = useId();
  /**
   * 応答の追い越しを防ぐための通し番号。
   * 「ソード」の結果より「ソ」の結果が遅れて届くと古い候補が表示され、
   * 入力中に候補がちらつく。最新の要求以外の応答は捨てる。
   */
  const requestIdRef = useRef(0);
  /**
   * 次の入力変化では候補を取りに行かない、という印。
   *
   * 候補を選んで確定した直後に、その入力でまた候補を出さないために使う。
   *
   * 初期キーワードがあるときも真から始める。/search?q=... を開くと
   * 入力欄に触れていないのに候補が取得され、検索結果の上へ候補リストが
   * 開いてしまっていた。候補は利用者が入力したときに出すものであり、
   * 結果を見に来ただけの画面で結果を覆い隠してはならない。
   */
  const skipNextFetchRef = useRef(initialKeyword.trim().length > 0);

  const runSearch = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return;
      }
      setIsOpen(false);
      setActiveIndex(-1);
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    },
    [router],
  );

  useEffect(() => {
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }

    if (!shouldSuggest(keyword)) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const timer = setTimeout(() => {
      void suggestBooksAction(keyword)
        .then((titles) => {
          // 自分より新しい要求が出ていたら、この応答は古いので捨てる
          if (requestIdRef.current !== requestId) {
            return;
          }
          setSuggestions(titles);
          setActiveIndex(-1);
          setIsOpen(titles.length > 0);
        })
        .catch(() => {
          // 候補は補助機能のため、失敗しても入力を妨げない。
          // エラーオブジェクトは出力しない。
          if (requestIdRef.current === requestId) {
            setSuggestions([]);
            setIsOpen(false);
          }
        });
    }, SUGGEST_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [keyword]);

  function selectSuggestion(value: string) {
    skipNextFetchRef.current = true;
    setKeyword(value);
    runSearch(value);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runSearch(keyword);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) =>
        current <= 0 ? suggestions.length - 1 : current - 1,
      );
      return;
    }
    if (event.key === 'Escape') {
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === 'Enter' && activeIndex >= 0) {
      const selected = suggestions[activeIndex];
      if (selected !== undefined) {
        event.preventDefault();
        selectSuggestion(selected);
      }
    }
  }

  const activeId = activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined;

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="flex gap-2">
        <label htmlFor="keyword" className="sr-only">
          検索キーワード
        </label>
        <input
          id="keyword"
          name="keyword"
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // クリックの前に閉じると候補を選べなくなるため少し待つ
            setTimeout(() => setIsOpen(false), 150);
          }}
          placeholder="タイトルで検索"
          className="flex-1 rounded border border-wood-300 bg-wood-50 px-3 py-2 text-wood-900"
        />
        <button
          type="submit"
          className="rounded bg-wood-600 px-4 py-2 font-medium text-wood-50 hover:bg-wood-700"
        >
          検索
        </button>
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="検索候補"
          className="absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded border border-wood-300 bg-wood-50 shadow-book"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
            >
              <button
                type="button"
                onMouseDown={(event) => {
                  // onBlur より先に動かし、候補が消える前に確定させる
                  event.preventDefault();
                  selectSuggestion(suggestion);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`block w-full truncate px-3 py-2 text-left text-sm text-wood-900 ${
                  index === activeIndex ? 'bg-wood-200' : 'hover:bg-wood-100'
                }`}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
