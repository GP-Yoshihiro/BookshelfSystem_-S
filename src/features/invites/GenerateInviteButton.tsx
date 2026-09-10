'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useReauth } from '@/features/auth/useReauth';
import { speakComplete, speakError } from '@/lib/speech';
import { generateInviteCodeAction } from './actions';
import { INVITE_INITIAL_STATE } from './state';
import {
  EXPIRY_OPTIONS,
  DEFAULT_EXPIRY_OPTION,
  type InviteExpiryOption,
} from './format';

export function GenerateInviteButton() {
  const [state, formAction, isPending] = useActionState(
    generateInviteCodeAction,
    INVITE_INITIAL_STATE,
  );
  const [expiry, setExpiry] = useState<InviteExpiryOption>(
    DEFAULT_EXPIRY_OPTION,
  );
  const { requireReauth } = useReauth();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.successMessage.length > 0) {
      speakComplete();
    } else if (state.errorMessage.length > 0) {
      speakError();
    }
  }, [state.successMessage, state.errorMessage]);

  function handleClick() {
    requireReauth(() => {
      formRef.current?.requestSubmit();
    });
  }

  return (
    <div className="space-y-2">
      <form ref={formRef} action={formAction} className="flex items-end gap-2">
        <div>
          <label
            htmlFor="expiry"
            className="block text-sm font-medium text-wood-100"
          >
            有効期限
          </label>
          <select
            id="expiry"
            name="expiry"
            value={expiry}
            onChange={(event) =>
              setExpiry(event.target.value as InviteExpiryOption)
            }
            className="mt-1 rounded border border-wood-300 bg-wood-50 px-3 py-2 text-wood-900"
          >
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleClick}
          disabled={isPending}
          className="rounded bg-wood-600 px-4 py-2 font-medium text-wood-50 hover:bg-wood-700 disabled:opacity-60"
        >
          {isPending ? '発行中…' : '招待コードを発行'}
        </button>
      </form>

      {state.errorMessage.length > 0 && (
        <p role="alert" className="text-sm text-red-300">
          {state.errorMessage}
        </p>
      )}
      {state.successMessage.length > 0 && (
        <p role="status" className="text-sm text-wood-100">
          {state.successMessage}
        </p>
      )}
    </div>
  );
}
