import { describe, it, expect } from 'vitest';
import { NextResponse } from 'next/server';
import { copySessionCookies } from './middleware';

describe('copySessionCookies', () => {
  it('from が持つ複数の Cookie をすべて to へコピーする', () => {
    const from = NextResponse.next();
    from.cookies.set('sb-access-token', 'access-value');
    from.cookies.set('sb-refresh-token', 'refresh-value');

    const to = NextResponse.next();
    copySessionCookies(from, to);

    const names = to.cookies.getAll().map((cookie) => cookie.name);
    expect(names).toContain('sb-access-token');
    expect(names).toContain('sb-refresh-token');
    expect(to.cookies.getAll()).toHaveLength(2);
  });

  it('from が Cookie を持たない場合、to は変化しない', () => {
    const from = NextResponse.next();
    const to = NextResponse.next();
    to.cookies.set('existing', 'value');

    copySessionCookies(from, to);

    expect(to.cookies.getAll()).toHaveLength(1);
    expect(to.cookies.get('existing')?.value).toBe('value');
  });

  it('Cookie の値が正しく引き継がれる', () => {
    const from = NextResponse.next();
    from.cookies.set('sb-access-token', 'new-token-value');

    const to = NextResponse.next();
    copySessionCookies(from, to);

    expect(to.cookies.get('sb-access-token')?.value).toBe('new-token-value');
  });

  it('戻り値として to のインスタンスを返す', () => {
    const from = NextResponse.next();
    const to = NextResponse.next();

    const result = copySessionCookies(from, to);

    expect(result).toBe(to);
  });
});
