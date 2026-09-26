import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
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

  it('binds the XP snapshot and its audit record to the epoch config version', async () => {
    const source = await readFile(new URL('./reward-settlement.service.ts', import.meta.url), 'utf8');
    expect(source).toContain('this.xp.summaryAt(user.id, epoch.endsAt, epoch.configVersion)');
    expect(source).toContain('configVersion: epoch.configVersion');
  });
});
