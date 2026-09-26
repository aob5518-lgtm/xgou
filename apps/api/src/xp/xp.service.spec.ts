import { describe, expect, it, vi } from 'vitest';
import { XpService } from './xp.service.js';

const asOf = new Date('2026-09-28T00:00:00.000Z');
const config = { minReferralQualification: '100', maxReferralDepth: 30, xpPerDollar: '1', dynamicXpPercent: '0.01' };

const fixture = (overrides: {
  principal?: string;
  ownParticipations?: readonly { amount: string }[];
  directEdges?: readonly { user: { participations: readonly { amount: string }[] } }[];
  closure?: readonly { descendantId: string; depth: number }[];
  descendantXp?: readonly { userId: string; _sum: { amount: string } }[];
} = {}) => {
  const db = {
    principalXpEntry: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: overrides.principal ?? '0' } }),
      groupBy: vi.fn().mockResolvedValue(overrides.descendantXp ?? []),
    },
    participation: { findMany: vi.fn().mockResolvedValue(overrides.ownParticipations ?? []) },
    referralEdge: { findMany: vi.fn().mockResolvedValue(overrides.directEdges ?? []) },
    referralClosure: { findMany: vi.fn().mockResolvedValue(overrides.closure ?? []) },
  };
  const service = new XpService({ db } as never, { current: vi.fn().mockResolvedValue({ values: config }) } as never);
  return { service, db };
};

describe('XP epoch-end as-of reconstruction', () => {
  it('uses Participation.effectiveAt < epoch.endsAt as the canonical Principal XP boundary', async () => {
    const { service, db } = fixture({ principal: '100' });
    const summary = await service.summaryAt('user-a', asOf);

    expect(summary.principalXp).toBe('100');
    expect(db.principalXpEntry.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-a', participation: { status: 'EFFECTIVE', effectiveAt: { lt: asOf } } },
    }));
    expect(db.participation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-a', status: 'EFFECTIVE', effectiveAt: { lt: asOf } },
    }));
  });

  it('rebuilds Dynamic XP only from referral graph and descendant Principal XP existing before epoch end', async () => {
    const { service, db } = fixture({
      principal: '100', ownParticipations: [{ amount: '100' }],
      directEdges: [{ user: { participations: [{ amount: '100' }] } }],
      closure: [{ descendantId: 'user-b', depth: 1 }],
      descendantXp: [{ userId: 'user-b', _sum: { amount: '1000' } }],
    });
    const summary = await service.summaryAt('user-a', asOf);

    expect(summary).toMatchObject({ directValidReferralCount: 1, unlockedDepth: 3, networkPrincipalXp: '1000', dynamicXp: '10', totalXp: '110' });
    expect(db.referralClosure.findMany).toHaveBeenCalledWith({
      where: { ancestorId: 'user-a', depth: { gte: 1, lte: 30 }, createdAt: { lt: asOf } },
      select: { descendantId: true, depth: true },
    });
    expect(db.principalXpEntry.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: { in: ['user-b'] }, participation: { status: 'EFFECTIVE', effectiveAt: { lt: asOf } } },
    }));
  });

  it('does not let a direct referral qualified after epoch end unlock historical depth', async () => {
    const { service, db } = fixture({ principal: '100', ownParticipations: [{ amount: '100' }] });
    const summary = await service.summaryAt('user-a', asOf);

    expect(summary).toMatchObject({ directValidReferralCount: 0, unlockedDepth: 0, dynamicXp: '0' });
    expect(db.referralEdge.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { inviterUserId: 'user-a', createdAt: { lt: asOf } },
      include: { user: { include: { participations: { where: { status: 'EFFECTIVE', effectiveAt: { lt: asOf } }, select: { amount: true } } } } },
    }));
  });
});
