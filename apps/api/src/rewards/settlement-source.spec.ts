import { describe, expect, it, vi } from 'vitest';
import { StrategyAccountSettlementSource } from './settlement-source.js';

const startsAt = new Date('2026-09-21T00:00:00.000Z');
const endsAt = new Date('2026-09-28T00:00:00.000Z');

const source = (account: Record<string, string>, baseline: Record<string, string> | null) => new StrategyAccountSettlementSource({ db: {
  strategy: { findUnique: vi.fn().mockResolvedValue({ account }) },
  epochSettlementBaseline: { findUnique: vi.fn().mockResolvedValue(baseline) },
} } as never);

describe('reward epoch settlement baseline', () => {
  it('excludes historical cumulative PnL captured before the first epoch', async () => {
    const spot = await source(
      { nav: '1400', realizedPnl: '1400', grossRealizedPnl: '1400', fees: '0', fundingPnl: '0', slippageCost: '0', liquidationPenalty: '0' },
      { nav: '1000', realizedPnl: '1000', grossRealizedPnl: '1000', fees: '0', fundingPnl: '0', slippageCost: '0', liquidationPenalty: '0' },
    ).getEpochMetrics('epoch-1', 'SPOT_SWING_V1', startsAt, endsAt);
    const futures = await source(
      { nav: '600', realizedPnl: '600', grossRealizedPnl: '600', fees: '0', fundingPnl: '0', slippageCost: '0', liquidationPenalty: '0' },
      { nav: '500', realizedPnl: '500', grossRealizedPnl: '500', fees: '0', fundingPnl: '0', slippageCost: '0', liquidationPenalty: '0' },
    ).getEpochMetrics('epoch-1', 'FUTURES_TREND_V1', startsAt, endsAt);

    expect(spot.netRealizedPnl).toBe('400');
    expect(futures.netRealizedPnl).toBe('100');
    expect(Number(spot.netRealizedPnl) + Number(futures.netRealizedPnl)).toBe(500);
  });

  it('refuses calculation when a historical epoch has no verified start baseline', async () => {
    await expect(source({}, null).getEpochMetrics('legacy-epoch', 'SPOT_SWING_V1', startsAt, endsAt)).rejects.toThrow('MISSING_EPOCH_BASELINE');
  });
});
