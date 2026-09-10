import { describe, it, expect } from 'vitest';
import {
  toExpiresInDays,
  isExpired,
  formatExpiry,
  DEFAULT_EXPIRY_OPTION,
  EXPIRY_OPTIONS,
} from './format';

const NOW = new Date('2026-09-10T12:00:00Z');

describe('DEFAULT_EXPIRY_OPTION', () => {
  it('既定は7日である', () => {
    expect(DEFAULT_EXPIRY_OPTION).toBe('7');
  });
});

describe('EXPIRY_OPTIONS', () => {
  it('無期限・1日・7日・30日の4種類を持つ', () => {
    expect(EXPIRY_OPTIONS.map((option) => option.value)).toEqual([
      'none',
      '1',
      '7',
      '30',
    ]);
  });
});

describe('toExpiresInDays', () => {
  it('無期限は null を返す', () => {
    expect(toExpiresInDays('none')).toBeNull();
  });

  it('日数指定は数値を返す', () => {
    expect(toExpiresInDays('1')).toBe(1);
    expect(toExpiresInDays('7')).toBe(7);
    expect(toExpiresInDays('30')).toBe(30);
  });
});

describe('isExpired', () => {
  it('無期限は期限切れにならない', () => {
    expect(isExpired(null, NOW)).toBe(false);
  });

  it('未来の日時は期限切れではない', () => {
    expect(isExpired('2026-09-11T12:00:00Z', NOW)).toBe(false);
  });

  it('過去の日時は期限切れである', () => {
    expect(isExpired('2026-09-09T12:00:00Z', NOW)).toBe(true);
  });

  it('解釈できない値は期限切れとして扱う', () => {
    expect(isExpired('not-a-date', NOW)).toBe(true);
  });
});

describe('formatExpiry', () => {
  it('無期限を明示する', () => {
    expect(formatExpiry(null, NOW)).toBe('無期限');
  });

  it('期限切れを明示する', () => {
    expect(formatExpiry('2026-09-09T12:00:00Z', NOW)).toBe('期限切れ');
  });

  it('有効な期限は日付を表示する', () => {
    expect(formatExpiry('2026-09-17T12:00:00Z', NOW)).toBe('2026/09/17 まで');
  });
});
