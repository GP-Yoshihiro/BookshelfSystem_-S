import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ReauthProvider } from './ReauthProvider';
import { useReauth, isReauthValid, REAUTH_VALID_MS } from './useReauth';

vi.mock('@/lib/supabase/verify', () => ({
  verifyPassword: vi.fn(),
}));

const { verifyPassword } = await import('@/lib/supabase/verify');
const mockedVerify = vi.mocked(verifyPassword);

function wrapper({ children }: { children: ReactNode }) {
  return <ReauthProvider email="user@example.com">{children}</ReauthProvider>;
}

describe('isReauthValid', () => {
  it('未検証なら無効', () => {
    expect(isReauthValid(null, 1_000)).toBe(false);
  });

  it('有効期限内なら有効', () => {
    expect(isReauthValid(10_000, 9_999)).toBe(true);
  });

  it('有効期限ちょうどは無効として扱う', () => {
    expect(isReauthValid(10_000, 10_000)).toBe(false);
  });

  it('有効期限を過ぎていれば無効', () => {
    expect(isReauthValid(10_000, 10_001)).toBe(false);
  });
});

describe('REAUTH_VALID_MS', () => {
  it('5分である', () => {
    expect(REAUTH_VALID_MS).toBe(5 * 60 * 1000);
  });
});

describe('useReauth', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockedVerify.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('未検証の状態ではダイアログを開き、処理を実行しない', () => {
    const action = vi.fn();
    const { result } = renderHook(() => useReauth(), { wrapper });

    act(() => result.current.requireReauth(action));

    expect(result.current.isDialogOpen).toBe(true);
    expect(action).not.toHaveBeenCalled();
  });

  it('パスワード検証に成功すると保留していた処理を実行する', async () => {
    mockedVerify.mockResolvedValue(true);
    const action = vi.fn();
    const { result } = renderHook(() => useReauth(), { wrapper });

    act(() => result.current.requireReauth(action));
    await act(async () => {
      await result.current.submitPassword('correct-password');
    });

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(result.current.isDialogOpen).toBe(false);
  });

  it('検証成功から5分以内はダイアログを開かず即実行する', async () => {
    mockedVerify.mockResolvedValue(true);
    const { result } = renderHook(() => useReauth(), { wrapper });

    act(() => result.current.requireReauth(vi.fn()));
    await act(async () => {
      await result.current.submitPassword('correct-password');
    });

    vi.advanceTimersByTime(4 * 60 * 1000);

    const secondAction = vi.fn();
    act(() => result.current.requireReauth(secondAction));

    expect(result.current.isDialogOpen).toBe(false);
    await waitFor(() => expect(secondAction).toHaveBeenCalledTimes(1));
  });

  it('即時実行パスで action が reject しても unhandledRejection が発生しない', async () => {
    // このテストは process の 'unhandledRejection' イベントを実際に監視する。
    // `expect(() => act(...)).not.toThrow()` は action の reject が同期的な
    // throw ではない限り常に成立してしまい、`void action()` のような
    // unhandled rejection を生むバグを検知できない。そのため、ここでは
    // 実際に Node のグローバルな unhandledRejection ハンドラを一時的に登録し、
    // マイクロタスク・マクロタスクをフラッシュした上でハンドラが呼ばれて
    // いないことを確認する。
    //
    // 注意: ここでは `vi.fn(() => Promise.reject(...))` のように action を
    // vi.fn() でラップしてはいけない。Vitest のモック関数は
    // `mock.settledResults` 等の内部トラッキングのために、返り値の
    // Promise に対して自前で .then/.catch を仕掛ける。そのため
    // vi.fn() でラップした時点で Node から見て「ハンドラ済み」の
    // Promise になってしまい、本物のバグが残っていても
    // unhandledRejection が一切発火せずテストが常に PASS してしまう
    // （このこと自体を実験で確認済み）。呼び出し回数はプレーンな
    // クロージャの手動カウンタで数える。
    //
    // fake timers 下では setTimeout 等の実行タイミングが実時間と一致しない
    // ため、このテストの間だけ real timers に切り替える。
    vi.useRealTimers();

    mockedVerify.mockResolvedValue(true);
    const { result } = renderHook(() => useReauth(), { wrapper });

    act(() => result.current.requireReauth(vi.fn()));
    await act(async () => {
      await result.current.submitPassword('correct-password');
    });

    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      // 検証成功から5分以内 = 即時実行パス。vi.fn() でラップせず、
      // プレーンな関数 + 手動カウンタで呼び出しを検知する。
      let callCount = 0;
      const rejectingAction = () => {
        callCount += 1;
        return Promise.reject(
          new Error('クリップボードへの書き込みに失敗しました'),
        );
      };

      act(() => {
        result.current.requireReauth(rejectingAction);
      });

      // Node は「reject した Promise に、同一 tick 内でハンドラが付かな
      // かった」場合に unhandledRejection を発火する。マイクロタスクと
      // マクロタスクの両方を複数回フラッシュし、発火する機会を十分に与える。
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(callCount).toBe(1);
      expect(result.current.isDialogOpen).toBe(false);
      expect(unhandledRejections).toHaveLength(0);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });

  it('submitPassword は保留中の action の完了まで待ってから resolve する', async () => {
    // 保留経由パス（submitPassword 内）は action の完了を await する契約に
    // なっている。action がまだ完了していない間は submitPassword も
    // resolve していないことを確認することで、この待機セマンティクスを
    // 検証する。
    mockedVerify.mockResolvedValue(true);
    const { result } = renderHook(() => useReauth(), { wrapper });

    let resolveAction: () => void = () => {};
    const action = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAction = resolve;
        }),
    );

    act(() => result.current.requireReauth(action));

    let settled = false;
    let submitPasswordPromise!: Promise<void>;

    await act(async () => {
      submitPasswordPromise = result.current
        .submitPassword('correct-password')
        .then(() => {
          settled = true;
        });
      // verifyPassword の resolve〜action 呼び出しまでのマイクロタスクを
      // 進める。
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(action).toHaveBeenCalledTimes(1);
    // action がまだ完了していないので、submitPassword もまだ resolve して
    // いない。
    expect(settled).toBe(false);

    await act(async () => {
      resolveAction();
      await submitPasswordPromise;
    });

    expect(settled).toBe(true);
  });

  it('検証成功から5分を過ぎると再びダイアログを開く', async () => {
    mockedVerify.mockResolvedValue(true);
    const { result } = renderHook(() => useReauth(), { wrapper });

    act(() => result.current.requireReauth(vi.fn()));
    await act(async () => {
      await result.current.submitPassword('correct-password');
    });

    vi.advanceTimersByTime(REAUTH_VALID_MS + 1);

    const secondAction = vi.fn();
    act(() => result.current.requireReauth(secondAction));

    expect(result.current.isDialogOpen).toBe(true);
    expect(secondAction).not.toHaveBeenCalled();
  });

  it('パスワード検証に失敗するとエラーを表示し処理を実行しない', async () => {
    mockedVerify.mockResolvedValue(false);
    const action = vi.fn();
    const { result } = renderHook(() => useReauth(), { wrapper });

    act(() => result.current.requireReauth(action));
    await act(async () => {
      await result.current.submitPassword('wrong-password');
    });

    expect(result.current.errorMessage).toBe('パスワードが正しくありません。');
    expect(result.current.isDialogOpen).toBe(true);
    expect(action).not.toHaveBeenCalled();
  });

  it('キャンセルすると保留中の処理を破棄する', async () => {
    const action = vi.fn();
    const { result } = renderHook(() => useReauth(), { wrapper });

    act(() => result.current.requireReauth(action));
    act(() => result.current.cancel());

    expect(result.current.isDialogOpen).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });
});
