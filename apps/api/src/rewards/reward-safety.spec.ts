import { afterEach, describe, expect, it } from 'vitest';
import { RewardSettlementService } from './reward-settlement.service.js';

const originalMode = process.env.REWARD_MODE;
const originalDistribution = process.env.REAL_REWARD_DISTRIBUTION_ENABLED;
const service = new RewardSettlementService({} as never, {} as never, {} as never, { now: () => new Date(0) });

afterEach(() => {
  if (originalMode === undefined) delete process.env.REWARD_MODE; else process.env.REWARD_MODE = originalMode;
  if (originalDistribution === undefined) delete process.env.REAL_REWARD_DISTRIBUTION_ENABLED; else process.env.REAL_REWARD_DISTRIBUTION_ENABLED = originalDistribution;
});

describe('paper reward safety gates', () => {
  it('rejects REAL reward mode', () => {
    process.env.REWARD_MODE = 'REAL';
    expect(() => { service.assertSafety(); }).toThrow('not implemented');
  });

  it('rejects real reward distribution even in PAPER mode', () => {
    process.env.REWARD_MODE = 'PAPER';
    process.env.REAL_REWARD_DISTRIBUTION_ENABLED = 'true';
    expect(() => { service.assertSafety(); }).toThrow('not implemented');
  });

  it('accepts the default PAPER-only configuration', () => {
    process.env.REWARD_MODE = 'PAPER';
    process.env.REAL_REWARD_DISTRIBUTION_ENABLED = 'false';
    expect(() => { service.assertSafety(); }).not.toThrow();
  });
});
