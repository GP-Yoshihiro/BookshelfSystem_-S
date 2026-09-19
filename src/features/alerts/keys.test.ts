import { describe, it, expect } from 'vitest';
import { userAlertsCacheKey, userAlertsCacheTag } from './keys';

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';

describe('userAlertsCacheKey', () => {
  it('キーに userId を必ず含める', () => {
    // 含め忘れると全利用者で同じキャッシュを共有し、他人のアラートが返る
    expect(userAlertsCacheKey(USER_A)).toContain(USER_A);
    expect(userAlertsCacheKey(USER_A)).not.toEqual(userAlertsCacheKey(USER_B));
  });
});

describe('userAlertsCacheTag', () => {
  it('利用者ごとに異なるタグになり、本棚のタグとも混ざらない', () => {
    expect(userAlertsCacheTag(USER_A)).not.toBe(userAlertsCacheTag(USER_B));
    // 本棚(books:)と同じ文字列にすると、本を保存しただけでアラートの
    // キャッシュが捨てられ、逆も起きる。用途ごとの接頭辞をここで固定する
    expect(userAlertsCacheTag(USER_A)).toBe(`alerts:${USER_A}`);
  });
});
