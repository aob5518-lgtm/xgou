import { describe, expect, it } from 'vitest';
import { planReferralBinding, ReferralBindingError } from '@xgou/referral-engine';

describe('Phase 1 referral security invariants', () => {
  it('rejects self invitation, permanent rebinding, and a descendant inviting its ancestor', () => {
    expect(() => planReferralBinding('a', 'a', [], false)).toThrow(ReferralBindingError);
    expect(() => planReferralBinding('a', 'b', [], true)).toThrow(ReferralBindingError);
    expect(() =>
      planReferralBinding(
        'a',
        'descendant',
        [{ ancestorId: 'a', descendantId: 'descendant', depth: 2 }],
        false,
      ),
    ).toThrow(ReferralBindingError);
  });
});
