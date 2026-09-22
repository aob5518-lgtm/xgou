import { describe, expect, it } from 'vitest';
import { planReferralBinding, ReferralBindingError, type ClosureRow } from './index.js';

describe('referral closure planning', () => {
  it('copies all inviter ancestors with incremented depth', () => {
    const rows = planReferralBinding('c', 'b', [
      { ancestorId: 'b', descendantId: 'b', depth: 0 },
      { ancestorId: 'a', descendantId: 'b', depth: 1 },
    ], false);
    expect(rows).toEqual([
      { ancestorId: 'b', descendantId: 'c', depth: 1 },
      { ancestorId: 'a', descendantId: 'c', depth: 2 },
    ]);
  });

  it.each([
    ['self referral', () => planReferralBinding('a', 'a', [], false)],
    ['rebinding', () => planReferralBinding('a', 'b', [], true)],
    ['cycle', () => planReferralBinding('a', 'b', [{ ancestorId: 'a', descendantId: 'b', depth: 1 }], false)],
  ])('rejects %s', (_name, operation) => {
    expect(operation).toThrow(ReferralBindingError);
  });

  it('builds a queryable 31-level chain', () => {
    const closure: ClosureRow[] = [];
    for (let level = 0; level <= 31; level += 1) {
      const id = `user-${String(level)}`;
      closure.push({ ancestorId: id, descendantId: id, depth: 0 });
      if (level > 0) {
        const inviterId = `user-${String(level - 1)}`;
        closure.push(...planReferralBinding(id, inviterId, closure.filter((row) => row.descendantId === inviterId), false));
      }
    }
    expect(closure).toContainEqual({ ancestorId: 'user-0', descendantId: 'user-31', depth: 31 });
    expect(closure.filter((row) => row.ancestorId === 'user-0' && row.depth <= 30)).toHaveLength(31);
  });
});
