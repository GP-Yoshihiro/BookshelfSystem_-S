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
   * 保留中だった（または即時実行される） action を実行する共通ヘルパー。
   *
   * action が reject した場合（同期的に throw した場合も含む）、ここでは
   * unhandled rejection / 未捕捉例外を防ぐためだけに catch し、何もしない。
   * この時点では再認証ダイアログは既に閉じている（または最初から開いていない）
   * ため、失敗内容を Context の errorMessage に入れても利用者には見えない。
   * エラーメッセージの表示やリトライ等、実際のエラー処理は requireReauth に
   * 渡す action 自身の責務とする（呼び出し側が action 内で try/catch する）。
   */
  const runAction = useCallback((action: PendingAction) => {
    try {
      const result = action();
      if (result instanceof Promise) {
        result.catch(() => {
          // 呼び出し側の責務: エラー処理は action 内で行うこと。
        });
      }
    } catch {
      // 同期的に throw された場合も同様に、ここでは何もしない。
    }
  }, []);

  const requireReauth = useCallback(
    (action: PendingAction) => {
      if (isReauthValid(validUntilRef.current, Date.now())) {
        runAction(action);
        return;
      }
      pendingActionRef.current = action;
      setErrorMessage('');
      setIsDialogOpen(true);
    },
    [runAction],
  );

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
        // 即時実行パス（requireReauth 内の runAction）と挙動を揃えるため、
        // ここでも await せず runAction 経由で実行する。エラー処理は
        // 呼び出し側の action 自身が担う。
        runAction(action);
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
