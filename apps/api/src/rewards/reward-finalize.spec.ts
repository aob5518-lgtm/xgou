import { Decimal } from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';
import { RewardSettlementService } from './reward-settlement.service.js';

const makeService = () => {
  let status = 'REVIEW';
  const epoch = {
    id: 'epoch-1', number: 2960, status, error: null, rewardPool: new Decimal(0), totalEffectiveXp: new Decimal(0),
    spotEndNav: new Decimal(0), futuresEndNav: new Decimal(0), hwmAfter: new Decimal(0), lossCarryforwardAfter: new Decimal(0),
    grossNetRealized: new Decimal(0), sourceSnapshots: [], allocations: [],
  };
  const tx = {
    rewardEpoch: {
      findUniqueOrThrow: vi.fn(() => Promise.resolve({ ...epoch, status })),
      updateMany: vi.fn(() => {
        if (status !== 'REVIEW') return Promise.resolve({ count: 0 });
        status = 'FINALIZED';
        return Promise.resolve({ count: 1 });
      }),
    },
    userRewardAllocation: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    rewardFundState: { upsert: vi.fn().mockResolvedValue({}) },
    rewardSettlementCursor: { upsert: vi.fn().mockResolvedValue({}) },
    rewardAuditEvent: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const db = {
    $transaction: vi.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    rewardEpoch: { findUniqueOrThrow: vi.fn(() => Promise.resolve({ status })) },
  };
  const service = new RewardSettlementService({ db } as never, {} as never, {} as never, { now: () => new Date('2026-09-28T01:00:00.000Z') });
  return { service, tx };
};

describe('reward epoch finalize idempotency', () => {
  it('returns ALREADY_FINALIZED for a duplicate finalize', async () => {
    const { service, tx } = makeService();
    await expect(service.finalize('epoch-1', 'actor-1')).resolves.toEqual({ status: 'FINALIZED', epochId: 'epoch-1' });
    await expect(service.finalize('epoch-1', 'actor-1')).resolves.toEqual({ status: 'ALREADY_FINALIZED', epochId: 'epoch-1' });
    expect(tx.rewardFundState.upsert).toHaveBeenCalledTimes(1);
  });

  it('allows exactly one winner under concurrent finalize attempts', async () => {
    const { service, tx } = makeService();
    const results = await Promise.all([service.finalize('epoch-1', 'actor-1'), service.finalize('epoch-1', 'actor-2')]);

    expect(results.map((result) => result.status).sort()).toEqual(['ALREADY_FINALIZED', 'FINALIZED']);
    expect(tx.rewardFundState.upsert).toHaveBeenCalledTimes(1);
  });
});
