import { Decimal } from 'decimal.js';
import type { StrategySettlementMetrics } from '@xgou/reward-engine';
import { PrismaService } from '../database/prisma.service.js';

export interface SettlementMetricSnapshot extends StrategySettlementMetrics {
  readonly strategyCode: string;
  readonly startNav: string;
  readonly endNav: string;
  readonly cumulativeRealizedPnl: string;
  readonly cumulativeGrossRealizedPnl: string;
  readonly cumulativeFees: string;
  readonly cumulativeFundingPnl: string;
  readonly cumulativeSlippageCost: string;
  readonly cumulativeLiquidationPenalty: string;
}

export interface SettlementSourceAdapter {
  getEpochMetrics(strategyCode: string, startsAt: Date, endsAt: Date): Promise<SettlementMetricSnapshot>;
}

export class StrategyAccountSettlementSource implements SettlementSourceAdapter {
  constructor(private readonly prisma: PrismaService, private readonly mode: 'PAPER' = 'PAPER') {}

  async getEpochMetrics(strategyCode: string, startsAt: Date, endsAt: Date): Promise<SettlementMetricSnapshot> {
    if (endsAt.getTime() <= startsAt.getTime()) throw new Error('reward epoch end must be after start');
    // Cumulative accounting cursors, not execution timestamps, define exactly-once epoch deltas.
    const [strategy, cursor] = await Promise.all([
      this.prisma.db.strategy.findUnique({ where: { code: strategyCode }, include: { account: true } }),
      this.prisma.db.rewardSettlementCursor.findUnique({ where: { mode_strategyCode: { mode: this.mode, strategyCode } } }),
    ]);
    const account = strategy?.account;
    const zero = new Decimal(0);
    const realized = new Decimal(account?.realizedPnl ?? 0);
    const fees = new Decimal(account?.fees ?? 0);
    const funding = new Decimal(account?.fundingPnl ?? 0);
    const slippage = new Decimal(account?.slippageCost ?? 0);
    const penalty = new Decimal(account?.liquidationPenalty ?? 0);
    const explicitGross = new Decimal(account?.grossRealizedPnl ?? 0);
    const gross = explicitGross.isZero() && !realized.isZero() ? realized.minus(funding).plus(fees).plus(slippage).plus(penalty) : explicitGross;
    const deltaGross = gross.minus(cursor?.grossRealizedPnl ?? zero);
    const deltaFees = fees.minus(cursor?.fees ?? zero);
    const deltaFunding = funding.minus(cursor?.fundingPnl ?? zero);
    const deltaSlippage = slippage.minus(cursor?.slippageCost ?? zero);
    const deltaPenalty = penalty.minus(cursor?.liquidationPenalty ?? zero);
    const deltaNet = deltaGross.plus(deltaFunding).minus(deltaFees).minus(deltaSlippage).minus(deltaPenalty);
    return {
      strategyCode, startNav: cursor?.nav.toString() ?? '0', endNav: account?.nav.toString() ?? '0',
      grossRealizedPnl: deltaGross.toFixed(), tradingFees: deltaFees.toFixed(), fundingPnl: deltaFunding.toFixed(),
      slippageCost: deltaSlippage.toFixed(), liquidationPenalty: deltaPenalty.toFixed(), netRealizedPnl: deltaNet.toFixed(),
      cumulativeRealizedPnl: realized.toFixed(), cumulativeGrossRealizedPnl: gross.toFixed(), cumulativeFees: fees.toFixed(),
      cumulativeFundingPnl: funding.toFixed(), cumulativeSlippageCost: slippage.toFixed(), cumulativeLiquidationPenalty: penalty.toFixed(),
    };
  }
}
