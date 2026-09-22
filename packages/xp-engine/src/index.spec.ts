import { describe, expect, it } from 'vitest';
import { calculateUnlockedDepth, calculateXp, principalXpForParticipation } from './index.js';

const config = { xpPerDollar: '1', dynamicXpPercent: '0.01', maxReferralDepth: 30 };

describe('XP engine', () => {
  it('awards one principal XP per dollar by default', () => {
    expect(principalXpForParticipation('10000', config.xpPerDollar).toFixed()).toBe('10000');
  });

  it('unlocks three levels per valid direct referral and caps at 30', () => {
    expect(calculateUnlockedDepth(1)).toBe(3);
    expect(calculateUnlockedDepth(2)).toBe(6);
    expect(calculateUnlockedDepth(10)).toBe(30);
    expect(calculateUnlockedDepth(100)).toBe(30);
  });

  it('uses only principal XP inside unlocked levels', () => {
    const result = calculateXp('100', 2, [
      { depth: 1, principalXp: '400000' },
      { depth: 6, principalXp: '600000' },
    ], config);
    expect(result.networkPrincipalXp.toFixed()).toBe('1000000');
    expect(result.dynamicXp.toFixed()).toBe('10000');
    expect(result.totalXp.toFixed()).toBe('10100');
  });

  it('excludes level 31 even in a 31-level tree', () => {
    const tree = Array.from({ length: 31 }, (_, index) => ({ depth: index + 1, principalXp: '100' }));
    const result = calculateXp('0', 10, tree, config);
    expect(result.networkPrincipalXp.toFixed()).toBe('3000');
    expect(result.dynamicXp.toFixed()).toBe('30');
  });

  it('does not compound dynamic XP recursively', () => {
    const result = calculateXp('0', 1, [{ depth: 1, principalXp: '100' }], config);
    expect(result.dynamicXp.toFixed()).toBe('1');
  });
});
