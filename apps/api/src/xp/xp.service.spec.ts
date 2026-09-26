import { describe, expect, it, vi } from 'vitest';
import { allocateRewardPool } from '@xgou/reward-engine';
import { XpService } from './xp.service.js';

const asOf = new Date('2026-09-28T00:00:00.000Z');
const config = { minReferralQualification: '100', maxReferralDepth: 30, xpPerDollar: '1', dynamicXpPercent: '0.01' };
const currentConfig = { minReferralQualification: '200', maxReferralDepth: 15, xpPerDollar: '2', dynamicXpPercent: '0.005' };

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
  const configs = {
    current: vi.fn().mockResolvedValue({ version: 11, values: currentConfig }),
    byVersion: vi.fn().mockResolvedValue({ version: 10, values: config }),
  };
  const service = new XpService({ db } as never, configs as never);
  return { service, db, configs };
};

describe('XP epoch-end as-of reconstruction', () => {
  it('uses Participation.effectiveAt < epoch.endsAt as the canonical Principal XP boundary', async () => {
    const { service, db } = fixture({ principal: '100' });
    const summary = await service.summaryAt('user-a', asOf, 10);

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
    const summary = await service.summaryAt('user-a', asOf, 10);

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
    const summary = await service.summaryAt('user-a', asOf, 10);

    expect(summary).toMatchObject({ directValidReferralCount: 0, unlockedDepth: 0, dynamicXp: '0' });
    expect(db.referralEdge.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { inviterUserId: 'user-a', createdAt: { lt: asOf } },
      include: { user: { include: { participations: { where: { status: 'EFFECTIVE', effectiveAt: { lt: asOf } }, select: { amount: true } } } } },
    }));
  });

  it('freezes Dynamic XP percentage to the epoch config version', async () => {
    const { service, configs } = fixture({
      principal: '100', ownParticipations: [{ amount: '250' }],
      directEdges: [{ user: { participations: [{ amount: '250' }] } }],
      closure: [{ descendantId: 'user-b', depth: 1 }],
      descendantXp: [{ userId: 'user-b', _sum: { amount: '1000' } }],
    });

    const summary = await service.summaryAt('user-a', asOf, 10);
    expect(summary).toMatchObject({ principalXp: '100', dynamicXp: '10', totalXp: '110' });
    expect(configs.byVersion).toHaveBeenCalledWith(10);
    expect(configs.current).not.toHaveBeenCalled();
  });

  it('freezes referral qualification to the epoch config version', async () => {
    const { service } = fixture({
      principal: '100', ownParticipations: [{ amount: '150' }],
      directEdges: [{ user: { participations: [{ amount: '150' }] } }],
    });

    const summary = await service.summaryAt('user-a', asOf, 10);
    expect(summary).toMatchObject({ eligibleForDynamicXp: true, directValidReferralCount: 1, unlockedDepth: 3 });
  });

  it('freezes referral depth to the epoch config version', async () => {
    const directs = Array.from({ length: 10 }, () => ({ user: { participations: [{ amount: '250' }] } }));
    const { service, db } = fixture({
      principal: '100', ownParticipations: [{ amount: '250' }], directEdges: directs,
      closure: [{ descendantId: 'user-depth-30', depth: 30 }],
      descendantXp: [{ userId: 'user-depth-30', _sum: { amount: '1000' } }],
    });

    const summary = await service.summaryAt('user-a', asOf, 10);
    expect(summary).toMatchObject({ directValidReferralCount: 10, unlockedDepth: 30, networkPrincipalXp: '1000', dynamicXp: '10' });
    expect(db.referralClosure.findMany).toHaveBeenCalledWith({
      where: { ancestorId: 'user-a', depth: { gte: 1, lte: 30 }, createdAt: { lt: asOf } },
      select: { descendantId: true, depth: true },
    });
  });

  it('keeps allocation and historical rebuild equal to the frozen v10 XP snapshot', async () => {
    const { service } = fixture({
      principal: '100', ownParticipations: [{ amount: '250' }],
      directEdges: [{ user: { participations: [{ amount: '250' }] } }],
      closure: [{ descendantId: 'user-b', depth: 1 }],
      descendantXp: [{ userId: 'user-b', _sum: { amount: '1000' } }],
    });
    const frozen = await service.summaryAt('user-a', asOf, 10);
    const rebuilt = await service.summaryAt('user-a', asOf, 10);
    expect(rebuilt).toEqual(frozen);

    const allocation = allocateRewardPool('1000', [
      { userId: 'user-a', principalXp: frozen.principalXp, dynamicXp: frozen.dynamicXp, totalXp: frozen.totalXp },
      { userId: 'user-c', principalXp: '90', dynamicXp: '0', totalXp: '90' },
    ], '0.05');
    expect(allocation).toMatchObject({ totalEffectiveXp: '200', allocationSum: '1000', dust: '0' });
    expect(allocation.allocations[0]).toMatchObject({ shareRatio: '0.55', grossReward: '550' });
  });

  it('keeps live summary compatible by using the current config when no version is provided', async () => {
    const { service, configs } = fixture({ principal: '100' });
    await service.summaryAt('user-a', asOf);
    expect(configs.current).toHaveBeenCalledOnce();
    expect(configs.byVersion).not.toHaveBeenCalled();
  });
});
