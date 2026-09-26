import { Decimal } from 'decimal.js';

export interface StrategySettlementMetrics {
  readonly grossRealizedPnl: string;
  readonly tradingFees: string;
  readonly slippageCost: string;
  readonly fundingPnl: string;
  readonly liquidationPenalty: string;
  readonly netRealizedPnl: string;
}

export interface RewardFundStateInput {
  readonly highWaterMark: string;
  readonly lossCarryforward: string;
  readonly cumulativeNetRealized: string;
  readonly cumulativeDistributedProfit: string;
}

export interface RewardSettlementResult {
  readonly aggregateNetRealized: string;
  readonly cumulativeNetRealized: string;
  readonly lossCarryforwardBefore: string;
  readonly lossCarryforwardApplied: string;
  readonly lossCarryforwardAfter: string;
  readonly hwmBefore: string;
  readonly hwmAfter: string;
  readonly distributableProfit: string;
  readonly riskReserve: string;
  readonly rewardPool: string;
  readonly cumulativeDistributedProfit: string;
}

export const canonicalNetRealized = (metrics: Omit<StrategySettlementMetrics, 'netRealizedPnl'>): string => new Decimal(metrics.grossRealizedPnl)
  .plus(metrics.fundingPnl).minus(metrics.tradingFees).minus(metrics.slippageCost).minus(metrics.liquidationPenalty).toFixed();

export const calculateRewardSettlement = (
  spot: StrategySettlementMetrics,
  futures: StrategySettlementMetrics,
  state: RewardFundStateInput,
  riskReserveRate: Decimal.Value,
): RewardSettlementResult => {
  const reserveRate = new Decimal(riskReserveRate);
  if (reserveRate.lt(0) || reserveRate.gt(1)) throw new Error('reward risk reserve rate must be between 0 and 1');
  const aggregate = new Decimal(spot.netRealizedPnl).plus(futures.netRealizedPnl);
  const cumulative = new Decimal(state.cumulativeNetRealized).plus(aggregate);
  const lcfBefore = new Decimal(state.lossCarryforward);
  const lcfApplied = aggregate.gt(0) ? Decimal.min(lcfBefore, aggregate) : new Decimal(0);
  const lcfAfter = aggregate.lt(0) ? lcfBefore.plus(aggregate.abs()) : lcfBefore.minus(lcfApplied);
  const afterLoss = Decimal.max(0, aggregate.minus(lcfApplied));
  const aboveHwm = Decimal.max(0, cumulative.minus(state.highWaterMark));
  const beforeReserve = Decimal.min(afterLoss, aboveHwm);
  const riskReserve = beforeReserve.mul(reserveRate);
  const pool = beforeReserve.minus(riskReserve);
  const hwmAfter = beforeReserve.gt(0) ? Decimal.max(state.highWaterMark, cumulative) : new Decimal(state.highWaterMark);
  return {
    aggregateNetRealized: aggregate.toFixed(), cumulativeNetRealized: cumulative.toFixed(),
    lossCarryforwardBefore: lcfBefore.toFixed(), lossCarryforwardApplied: lcfApplied.toFixed(), lossCarryforwardAfter: lcfAfter.toFixed(),
    hwmBefore: new Decimal(state.highWaterMark).toFixed(), hwmAfter: hwmAfter.toFixed(), distributableProfit: beforeReserve.toFixed(),
    riskReserve: riskReserve.toFixed(), rewardPool: pool.toFixed(), cumulativeDistributedProfit: new Decimal(state.cumulativeDistributedProfit).plus(pool).toFixed(),
  };
};

export interface XpAllocationInput {
  readonly userId: string;
  readonly principalXp: string;
  readonly dynamicXp: string;
  readonly totalXp: string;
}

export interface RewardAllocationResult extends XpAllocationInput {
  readonly globalTotalXp: string;
  readonly shareRatio: string;
  readonly grossReward: string;
  readonly feeRate: string;
  readonly withdrawalFee: string;
  readonly netReward: string;
}

export const allocateRewardPool = (
  rewardPool: Decimal.Value,
  users: readonly XpAllocationInput[],
  feeRate: Decimal.Value,
  precision = 18,
): { readonly allocations: readonly RewardAllocationResult[]; readonly totalEffectiveXp: string; readonly allocationSum: string; readonly dust: string } => {
  const pool = new Decimal(rewardPool);
  const fee = new Decimal(feeRate);
  const totalXp = users.reduce((sum, user) => sum.plus(user.totalXp), new Decimal(0));
  if (pool.gt(0) && totalXp.isZero()) throw new Error('ZERO_EFFECTIVE_XP');
  let allocated = new Decimal(0);
  const allocations = users.map((user, index) => {
    const xp = new Decimal(user.totalXp);
    const ratio = totalXp.isZero() ? new Decimal(0) : xp.div(totalXp);
    const gross = index === users.length - 1 ? pool.minus(allocated) : pool.mul(ratio).toDecimalPlaces(precision, Decimal.ROUND_DOWN);
    allocated = allocated.plus(gross);
    const withdrawalFee = gross.mul(fee);
    return { ...user, globalTotalXp: totalXp.toFixed(), shareRatio: ratio.toFixed(), grossReward: gross.toFixed(), feeRate: fee.toFixed(), withdrawalFee: withdrawalFee.toFixed(), netReward: gross.minus(withdrawalFee).toFixed() };
  });
  return { allocations, totalEffectiveXp: totalXp.toFixed(), allocationSum: allocated.toFixed(), dust: pool.minus(allocated).toFixed() };
};

export interface Clock { now(): Date }
export class SystemClock implements Clock { now(): Date { return new Date(); } }
export const utcWeekBounds = (value: Date): { readonly startsAt: Date; readonly endsAt: Date; readonly number: number } => {
  const startsAt = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  startsAt.setUTCDate(startsAt.getUTCDate() - ((startsAt.getUTCDay() + 6) % 7));
  const endsAt = new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1_000);
  return { startsAt, endsAt, number: Math.floor(startsAt.getTime() / (7 * 24 * 60 * 60 * 1_000)) };
};
