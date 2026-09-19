import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchForm } from './SearchForm';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('./actions', () => ({
  suggestBooksAction: vi.fn(),
}));

const { suggestBooksAction } = await import('./actions');
const mockedSuggest = vi.mocked(suggestBooksAction);

beforeEach(() => {
  mockedSuggest.mockReset();
  mockedSuggest.mockResolvedValue(['転生したらスライムだった件（33）']);
});

describe('SearchForm の候補リスト', () => {
  /**
   * /search?q=... を開いたときに候補を取りに行くと、入力欄へ触れていないのに
   * 候補リストが検索結果の上へ開き、結果を覆い隠してしまう。
   * 候補は利用者が入力したときにだけ出す。
   */
  it('初期キーワードがあっても、触れていなければ候補を取りに行かない', async () => {
    render(<SearchForm initialKeyword="転生したらスライムだった件" />);

    // 取得はデバウンス後に走るため、その時間を十分に過ぎるまで待つ
    await new Promise((resolve) => {
      setTimeout(resolve, 700);
    });

    expect(mockedSuggest).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('利用者が入力したときは候補を取りに行き、候補リストを開く', async () => {
    const user = userEvent.setup();
    render(<SearchForm initialKeyword="" />);

    await user.type(screen.getByRole('combobox'), '転生');

    await waitFor(
      () => {
        expect(mockedSuggest).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );

    expect(
      await screen.findByRole('option', {
        name: '転生したらスライムだった件（33）',
      }),
    ).toBeVisible();
  });

  /**
   * 初期キーワードで一度抑止したあと、その印が残って以降の入力まで
   * 候補が出なくなってはいけない。
   */
  it('初期キーワードがある画面でも、入力すれば候補が出るようになる', async () => {
    const user = userEvent.setup();
    render(<SearchForm initialKeyword="転生したらスライムだった件" />);

    await user.type(screen.getByRole('combobox'), 'の');

    await waitFor(
      () => {
        expect(mockedSuggest).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );
  });
});
