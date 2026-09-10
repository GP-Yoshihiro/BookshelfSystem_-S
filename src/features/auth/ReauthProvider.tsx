'use client';

import {
  createContext,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { verifyPassword } from '@/lib/supabase/verify';

/** 再認証が有効とみなされる時間（5分） */
export const REAUTH_VALID_MS = 5 * 60 * 1000;

/** 保留中の処理。再認証成功後に実行される */
type PendingAction = () => void | Promise<void>;

export interface ReauthContextValue {
  isDialogOpen: boolean;
  errorMessage: string;
  isVerifying: boolean;
  requireReauth: (action: PendingAction) => void;
  submitPassword: (password: string) => Promise<void>;
  cancel: () => void;
}

export const ReauthContext = createContext<ReauthContextValue | null>(null);

/** 有効期限の判定。境界値（ちょうど期限）は無効として扱う */
export function isReauthValid(
  validUntil: number | null,
  now: number,
): boolean {
  return validUntil !== null && now < validUntil;
}

/**
 * 再認証の有効期限を保持する Provider。
 *
 * 有効期限は React state（メモリ）にのみ保持し、localStorage や Cookie へは
 * 書き込まない。タブを閉じれば失効するため、共有端末でのリスクを抑えられる。
 */
export function ReauthProvider({
  email,
  children,
}: {
  email: string;
  children: ReactNode;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const validUntilRef = useRef<number | null>(null);
  const pendingActionRef = useRef<PendingAction | null>(null);

  /**
   * 保留中だった（または即時実行される）action を実行する共通ヘルパー。
   *
   * 戻り値の Promise は reject しない。action が同期的に throw した場合も、
   * 返した Promise が reject した場合も、ここで catch して常に resolve する
   * Promise を返す。これにより:
   *   - 即時実行パス（requireReauth 内）は呼び出し元（クリックハンドラ等）が
   *     await できないため、投げっぱなしで呼んでも unhandled rejection には
   *     ならない。
   *   - 保留経由パス（submitPassword 内）は、この Promise を await するだけで
   *     安全に action の完了を待てる（submitPassword 自体が reject すること
   *     はない）。
   * どちらのパスでも、action の失敗（エラー表示・リトライ等）をどう扱うかは
   * requireReauth に渡す action 自身の責務であり、ここでは一切処理しない
   * （Context の errorMessage にも書き込まない）。
   */
  const runAction = useCallback(async (action: PendingAction) => {
    try {
      await action();
    } catch {
      // 呼び出し側の責務: エラー処理は action 内で行うこと。ここでは
      // unhandled rejection / 未捕捉例外を防ぐためだけに握りつぶす。
    }
  }, []);

  const requireReauth = useCallback(
    (action: PendingAction) => {
      if (isReauthValid(validUntilRef.current, Date.now())) {
        // 呼び出し元はクリックハンドラ等で await できないため、ここでは
        // 投げっぱなしにする。runAction は reject しない Promise を返すため
        // unhandled rejection は発生しない。
        void runAction(action);
        return;
      }
      pendingActionRef.current = action;
      setErrorMessage('');
      setIsDialogOpen(true);
    },
    [runAction],
  );

  /**
   * パスワードを検証し、成功すれば保留中の action を実行する。
   *
   * 待機セマンティクス: 保留中の action がある場合、この関数はその action の
   * 完了（成功・失敗いずれも）まで待ってから resolve する。呼び出し側が
   * `await submitPassword(...)` した直後に完了フィードバック（音声案内等）を
   * 出す用途があるため。action 自身が reject しても runAction が握りつぶす
   * ため submitPassword が reject することはない。
   */
  const submitPassword = useCallback(
    async (password: string) => {
      setIsVerifying(true);
      const ok = await verifyPassword(email, password);
      setIsVerifying(false);

      if (!ok) {
        setErrorMessage('パスワードが正しくありません。');
        return;
      }

      validUntilRef.current = Date.now() + REAUTH_VALID_MS;
      setErrorMessage('');
      setIsDialogOpen(false);

      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      if (action) {
        // 待機セマンティクス: submitPassword は保留中だった action の完了
        // （成功・失敗を問わず）まで待ってから resolve する。ReauthDialog が
        // `await submitPassword(...)` した直後に完了フィードバック（音声
        // 案内など）を出す設計のため、action の完了を保証する必要がある。
        // runAction は reject しない Promise を返すので、ここで await しても
        // submitPassword 自体が reject することはない。action 自身の失敗を
        // どう扱うか（エラー表示・リトライ等）は、即時実行パスと同様に
        // action 自身の責務であり、ここでは関知しない。
        await runAction(action);
      }
    },
    [email, runAction],
  );

  const cancel = useCallback(() => {
    pendingActionRef.current = null;
    setErrorMessage('');
    setIsDialogOpen(false);
  }, []);

  const value = useMemo<ReauthContextValue>(
    () => ({
      isDialogOpen,
      errorMessage,
      isVerifying,
      requireReauth,
      submitPassword,
      cancel,
    }),
    [
      isDialogOpen,
      errorMessage,
      isVerifying,
      requireReauth,
      submitPassword,
      cancel,
    ],
  );

  return (
    <ReauthContext.Provider value={value}>{children}</ReauthContext.Provider>
  );
}
