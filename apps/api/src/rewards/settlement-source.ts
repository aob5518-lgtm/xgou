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
  getEpochMetrics(rewardEpochId: string, strategyCode: string, startsAt: Date, endsAt: Date): Promise<SettlementMetricSnapshot>;
}

export class StrategyAccountSettlementSource implements SettlementSourceAdapter {
  constructor(private readonly prisma: PrismaService) {}

  async getEpochMetrics(rewardEpochId: string, strategyCode: string, startsAt: Date, endsAt: Date): Promise<SettlementMetricSnapshot> {
    if (endsAt.getTime() <= startsAt.getTime()) throw new Error('reward epoch end must be after start');
    // The immutable epoch-start baseline defines the time boundary. The finalized
    // cursor remains an exactly-once/reconciliation checkpoint only.
    const [strategy, baseline] = await Promise.all([
      this.prisma.db.strategy.findUnique({ where: { code: strategyCode }, include: { account: true } }),
      this.prisma.db.epochSettlementBaseline.findUnique({ where: { rewardEpochId_strategyCode: { rewardEpochId, strategyCode } } }),
    ]);
    if (!baseline) throw new Error('MISSING_EPOCH_BASELINE');
    const account = strategy?.account;
    const realized = new Decimal(account?.realizedPnl ?? 0);
    const fees = new Decimal(account?.fees ?? 0);
    const funding = new Decimal(account?.fundingPnl ?? 0);
    const slippage = new Decimal(account?.slippageCost ?? 0);
    const penalty = new Decimal(account?.liquidationPenalty ?? 0);
    const explicitGross = new Decimal(account?.grossRealizedPnl ?? 0);
    const gross = explicitGross.isZero() && !realized.isZero() ? realized.minus(funding).plus(fees).plus(slippage).plus(penalty) : explicitGross;
    const deltaGross = gross.minus(baseline.grossRealizedPnl);
    const deltaFees = fees.minus(baseline.fees);
    const deltaFunding = funding.minus(baseline.fundingPnl);
    const deltaSlippage = slippage.minus(baseline.slippageCost);
    const deltaPenalty = penalty.minus(baseline.liquidationPenalty);
    const deltaNet = deltaGross.plus(deltaFunding).minus(deltaFees).minus(deltaSlippage).minus(deltaPenalty);
    return {
      strategyCode, startNav: baseline.nav.toString(), endNav: account?.nav.toString() ?? '0',
      grossRealizedPnl: deltaGross.toFixed(), tradingFees: deltaFees.toFixed(), fundingPnl: deltaFunding.toFixed(),
      slippageCost: deltaSlippage.toFixed(), liquidationPenalty: deltaPenalty.toFixed(), netRealizedPnl: deltaNet.toFixed(),
      cumulativeRealizedPnl: realized.toFixed(), cumulativeGrossRealizedPnl: gross.toFixed(), cumulativeFees: fees.toFixed(),
      cumulativeFundingPnl: funding.toFixed(), cumulativeSlippageCost: slippage.toFixed(), cumulativeLiquidationPenalty: penalty.toFixed(),
    };
  }
}
