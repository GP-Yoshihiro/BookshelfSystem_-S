'use client';

import { useContext } from 'react';
import { ReauthContext, type ReauthContextValue } from './ReauthProvider';

export { REAUTH_VALID_MS, isReauthValid } from './ReauthProvider';

/**
 * 再認証を要求するフック。
 * ReauthProvider の内側でのみ使用できる。
 */
export function useReauth(): ReauthContextValue {
  const context = useContext(ReauthContext);
  if (context === null) {
    throw new Error('useReauth は ReauthProvider の内側で使用してください。');
  }
  return context;
}
