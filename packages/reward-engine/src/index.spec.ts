import { describe, expect, it } from 'vitest';
import { allocateRewardPool, calculateRewardSettlement, canonicalNetRealized, utcWeekBounds, type StrategySettlementMetrics } from './index.js';

const metric = (net: string): StrategySettlementMetrics => ({ grossRealizedPnl: net, tradingFees: '0', slippageCost: '0', fundingPnl: '0', liquidationPenalty: '0', netRealizedPnl: net });
const empty = metric('0');

describe('paper reward settlement', () => {
  it('uses realized-only canonical metrics including funding, fees, slippage and liquidation penalty', () => {
    expect(canonicalNetRealized({ grossRealizedPnl: '500', fundingPnl: '-100', tradingFees: '50', slippageCost: '20', liquidationPenalty: '30' })).toBe('300');
    expect(calculateRewardSettlement(empty, empty, { highWaterMark: '0', lossCarryforward: '0', cumulativeNetRealized: '0', cumulativeDistributedProfit: '0' }, 0).rewardPool).toBe('0');
  });
  it('applies HWM and loss carryforward across +1000, -600, +450, +500', () => {
    let state = { highWaterMark: '0', lossCarryforward: '0', cumulativeNetRealized: '0', cumulativeDistributedProfit: '0' };
    const pools: string[] = [];
    for (const value of ['1000', '-600', '450', '500']) {
      const result = calculateRewardSettlement(metric(value), empty, state, 0);
      pools.push(result.rewardPool);
      state = { highWaterMark: result.hwmAfter, lossCarryforward: result.lossCarryforwardAfter, cumulativeNetRealized: result.cumulativeNetRealized, cumulativeDistributedProfit: result.cumulativeDistributedProfit };
    }
    expect(pools).toEqual(['1000', '0', '0', '350']);
    expect(state.lossCarryforward).toBe('0');
  });
  it('aggregates positive and negative strategy contributions and applies a configurable reserve', () => {
    const result = calculateRewardSettlement(metric('500'), metric('-300'), { highWaterMark: '0', lossCarryforward: '0', cumulativeNetRealized: '0', cumulativeDistributedProfit: '0' }, '0.10');
    expect(result.rewardPool).toBe('180');
    expect(result.riskReserve).toBe('20');
  });
  it('allocates by frozen total XP and conserves dust exactly', () => {
    const result = allocateRewardPool('1000', [{ userId: 'a', principalXp: '600', dynamicXp: '0', totalXp: '600' }, { userId: 'b', principalXp: '300', dynamicXp: '0', totalXp: '300' }, { userId: 'c', principalXp: '100', dynamicXp: '0', totalXp: '100' }], '0.05');
    expect(result.allocations.map((row) => row.grossReward)).toEqual(['600', '300', '100']);
    expect(result.allocationSum).toBe('1000');
    expect(result.dust).toBe('0');
    expect(allocateRewardPool('1', [{ userId: 'a', principalXp: '1', dynamicXp: '0', totalXp: '1' }, { userId: 'b', principalXp: '1', dynamicXp: '0', totalXp: '1' }, { userId: 'c', principalXp: '1', dynamicXp: '0', totalXp: '1' }], '0.05').allocationSum).toBe('1');
  });
  it('uses total XP including dynamic XP and rejects a positive pool with zero XP', () => {
    const result = allocateRewardPool('1000', [{ userId: 'a', principalXp: '100', dynamicXp: '50', totalXp: '150' }, { userId: 'b', principalXp: '50', dynamicXp: '0', totalXp: '50' }], '0.05');
    expect(result.allocations.map((row) => row.grossReward)).toEqual(['750', '250']);
    expect(() => allocateRewardPool('1', [], '0.05')).toThrow('ZERO_EFFECTIVE_XP');
  });
  it('keeps entitlement gross and treats the 5% fee as preview only', () => {
    const result = allocateRewardPool('1000', [{ userId: 'a', principalXp: '100', dynamicXp: '0', totalXp: '100' }], '0.05');
    expect(result.allocations[0]).toMatchObject({ grossReward: '1000', withdrawalFee: '50', netReward: '950' });
    expect(result.allocationSum).toBe('1000');
  });
  it('uses UTC Monday boundaries independent of local timezone', () => {
    const bounds = utcWeekBounds(new Date('2026-09-23T23:00:00.000Z'));
    expect(bounds.startsAt.toISOString()).toBe('2026-09-21T00:00:00.000Z');
    expect(bounds.endsAt.toISOString()).toBe('2026-09-28T00:00:00.000Z');
  });
});
