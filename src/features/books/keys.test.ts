import { describe, it, expect } from 'vitest';
import { userBooksCacheKey, userBooksCacheTag } from './keys';

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';

describe('userBooksCacheKey', () => {
  it('キーに userId を必ず含める', () => {
    expect(userBooksCacheKey(USER_A)).toContain(USER_A);
  });

  it('利用者ごとに異なるキーになる', () => {
    expect(userBooksCacheKey(USER_A)).not.toEqual(userBooksCacheKey(USER_B));
  });

  it('同じ利用者なら同じキーになる', () => {
    expect(userBooksCacheKey(USER_A)).toEqual(userBooksCacheKey(USER_A));
  });

  it('用途を示す接頭辞を持つ', () => {
    expect(userBooksCacheKey(USER_A)[0]).toBe('user-books');
  });
});

describe('userBooksCacheTag', () => {
  it('タグに userId を必ず含める', () => {
    expect(userBooksCacheTag(USER_A)).toContain(USER_A);
  });

  it('利用者ごとに異なるタグになる', () => {
    expect(userBooksCacheTag(USER_A)).not.toBe(userBooksCacheTag(USER_B));
  });

  it('同じ利用者なら同じタグになる', () => {
    expect(userBooksCacheTag(USER_A)).toBe(userBooksCacheTag(USER_A));
  });
});
