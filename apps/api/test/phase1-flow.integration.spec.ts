import { describe, expect, it } from 'vitest';
import { planReferralBinding, type ClosureRow } from '@xgou/referral-engine';
import { calculateXp } from '@xgou/xp-engine';

describe('Phase 1 referral-to-XP flow', () => {
  it('materializes 31 levels and pays only the first 30 unlocked levels', () => {
    const closure: ClosureRow[] = [];
    const principal = new Map<string, string>();

    for (let level = 0; level <= 31; level += 1) {
      const id = `member-${String(level)}`;
      principal.set(id, '100');
      closure.push({ ancestorId: id, descendantId: id, depth: 0 });
      if (level === 0) continue;
      const inviterId = `member-${String(level - 1)}`;
      closure.push(
        ...planReferralBinding(
          id,
          inviterId,
          closure.filter((row) => row.descendantId === inviterId),
          false,
        ),
      );
    }

    const descendants = closure
      .filter((row) => row.ancestorId === 'member-0' && row.depth > 0)
      .map((row) => ({ depth: row.depth, principalXp: principal.get(row.descendantId) ?? '0' }));
    const result = calculateXp('100', 10, descendants, {
      xpPerDollar: '1',
      dynamicXpPercent: '0.01',
      maxReferralDepth: 30,
    });

    expect(descendants).toHaveLength(31);
    expect(result.unlockedDepth).toBe(30);
    expect(result.networkPrincipalXp.toFixed()).toBe('3000');
    expect(result.dynamicXp.toFixed()).toBe('30');
    expect(result.totalXp.toFixed()).toBe('130');
  });
});
