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

  it('即時実行パスで action が reject しても例外が外へ漏れない', async () => {
    mockedVerify.mockResolvedValue(true);
    const { result } = renderHook(() => useReauth(), { wrapper });

    act(() => result.current.requireReauth(vi.fn()));
    await act(async () => {
      await result.current.submitPassword('correct-password');
    });

    // 検証成功から5分以内 = 即時実行パス。reject する action を渡しても
    // requireReauth の呼び出し自体は例外を投げず、unhandled rejection にも
    // ならないことを確認する。
    const rejectingAction = vi.fn(() =>
      Promise.reject(new Error('クリップボードへの書き込みに失敗しました')),
    );

    expect(() => {
      act(() => result.current.requireReauth(rejectingAction));
    }).not.toThrow();

    await waitFor(() => expect(rejectingAction).toHaveBeenCalledTimes(1));
    expect(result.current.isDialogOpen).toBe(false);
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
