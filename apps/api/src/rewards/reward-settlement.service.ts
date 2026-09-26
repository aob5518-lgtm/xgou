import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Decimal } from 'decimal.js';
import { allocateRewardPool, calculateRewardSettlement, utcWeekBounds, type Clock } from '@xgou/reward-engine';
import { PrismaService } from '../database/prisma.service.js';
import { SystemConfigService } from '../config/system-config.service.js';
import { XpService } from '../xp/xp.service.js';
import { StrategyAccountSettlementSource } from './settlement-source.js';
import type { Prisma } from '@xgou/database';

const REWARD_STRATEGIES = ['SPOT_SWING_V1', 'FUTURES_TREND_V1'] as const;

@Injectable()
export class RewardSettlementService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService, private readonly configs: SystemConfigService, private readonly xp: XpService, @Inject('REWARD_CLOCK') private readonly clock: Clock) {}

  onModuleInit(): void { this.assertSafety(); }

  assertSafety(): void {
    if (process.env.REWARD_MODE === 'REAL') throw new Error('Real reward settlement is not implemented in Phase 4');
    if (process.env.REAL_REWARD_DISTRIBUTION_ENABLED === 'true') throw new Error('Real reward distribution is not implemented in Phase 4');
  }

  async ensureCurrentEpoch(now = this.clock.now()) {
    const bounds = utcWeekBounds(now);
    const config = await this.configs.current();
    const identity = { mode_startsAt: { mode: 'PAPER' as const, startsAt: bounds.startsAt } };
    const existing = await this.prisma.db.rewardEpoch.findUnique({ where: identity });
    if (existing) return existing;
    try {
      return await this.prisma.db.$transaction(async (tx) => {
        const concurrent = await tx.rewardEpoch.findUnique({ where: identity });
        if (concurrent) return concurrent;
        const epoch = await tx.rewardEpoch.create({ data: { number: bounds.number, startsAt: bounds.startsAt, endsAt: bounds.endsAt, mode: 'PAPER', configVersion: config.version || 1 } });
        const baselines = await Promise.all(REWARD_STRATEGIES.map((strategyCode) => this.captureBaseline(tx, strategyCode)));
        await tx.epochSettlementBaseline.createMany({ data: baselines.map((baseline) => ({ rewardEpochId: epoch.id, ...baseline })) });
        await tx.rewardAuditEvent.create({ data: { rewardEpochId: epoch.id, type: 'EPOCH_CREATED', details: { mode: 'PAPER', number: epoch.number, baselines: REWARD_STRATEGIES } } });
        return epoch;
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002' && (error as { code?: string }).code !== 'P2034') throw error;
      return this.prisma.db.rewardEpoch.findUniqueOrThrow({ where: identity });
    }
  }

  async calculate(epochId: string, actorId: string | null = null) {
    this.assertSafety();
    const epoch = await this.prisma.db.rewardEpoch.findUniqueOrThrow({ where: { id: epochId } });
    if (epoch.status === 'REVIEW' || epoch.status === 'FINALIZED') return this.review(epochId);
    if (epoch.status !== 'OPEN') throw new Error(`epoch cannot calculate from ${epoch.status}`);
    await this.prisma.db.$transaction([
      this.prisma.db.rewardEpoch.update({ where: { id: epochId }, data: { status: 'CALCULATING' } }),
      this.prisma.db.rewardAuditEvent.create({ data: { rewardEpochId: epochId, type: 'CALCULATION_STARTED', actorId, details: { mode: 'PAPER' } } }),
    ]);
    try {
      const source = new StrategyAccountSettlementSource(this.prisma);
      const [spot, futures, state, config, users] = await Promise.all([
        source.getEpochMetrics(epoch.id, 'SPOT_SWING_V1', epoch.startsAt, epoch.endsAt),
        source.getEpochMetrics(epoch.id, 'FUTURES_TREND_V1', epoch.startsAt, epoch.endsAt),
        this.prisma.db.rewardFundState.upsert({ where: { mode: 'PAPER' }, create: { mode: 'PAPER' }, update: {} }),
        this.configs.byVersion(epoch.configVersion), this.prisma.db.user.findMany({ select: { id: true }, orderBy: { id: 'asc' } }),
      ]);
      const settlement = calculateRewardSettlement(spot, futures, {
        highWaterMark: state.highWaterMark.toString(), lossCarryforward: state.lossCarryforward.toString(),
        cumulativeNetRealized: state.cumulativeNetRealized.toString(), cumulativeDistributedProfit: state.cumulativeDistributedProfit.toString(),
      }, config.values.rewardRiskReserveRate);
      const xpRows = [];
      for (const user of users) {
        const summary = await this.xp.summaryAt(user.id, epoch.endsAt);
        xpRows.push({ userId: user.id, principalXp: summary.principalXp, dynamicXp: summary.dynamicXp, totalXp: summary.totalXp, directReferralCount: summary.directValidReferralCount, unlockedDepth: summary.unlockedDepth, networkPrincipalXp: summary.networkPrincipalXp });
      }
      let calculationError: string | null = null;
      let allocation;
      try { allocation = allocateRewardPool(settlement.rewardPool, xpRows, config.values.rewardWithdrawalFee); }
      catch (error) {
        if (!(error instanceof Error) || error.message !== 'ZERO_EFFECTIVE_XP') throw error;
        calculationError = error.message;
        allocation = { allocations: [], totalEffectiveXp: '0', allocationSum: '0', dust: settlement.rewardPool };
      }
      const now = this.clock.now();
      await this.prisma.db.$transaction([
        this.prisma.db.settlementSourceSnapshot.createMany({ data: [this.sourceData(epochId, spot), this.sourceData(epochId, futures)] }),
        this.prisma.db.xpSnapshot.createMany({ data: xpRows.map((row) => ({ ...row, rewardEpochId: epochId, snapshotAt: epoch.endsAt })) }),
        this.prisma.db.userRewardAllocation.createMany({ data: allocation.allocations.map((row) => ({ ...row, rewardEpochId: epochId, mode: 'PAPER', status: 'PENDING' })) }),
        this.prisma.db.rewardEpoch.update({ where: { id: epochId }, data: {
          status: 'REVIEW', spotStartNav: spot.startNav, spotEndNav: spot.endNav, spotRealizedGross: spot.grossRealizedPnl, spotFees: spot.tradingFees, spotSlippage: spot.slippageCost, spotNetRealized: spot.netRealizedPnl,
          futuresStartNav: futures.startNav, futuresEndNav: futures.endNav, futuresRealizedGross: futures.grossRealizedPnl, futuresFunding: futures.fundingPnl, futuresFees: futures.tradingFees, futuresLiquidationPenalty: futures.liquidationPenalty, futuresSlippage: futures.slippageCost, futuresNetRealized: futures.netRealizedPnl,
          grossNetRealized: settlement.aggregateNetRealized, lossCarryforwardBefore: settlement.lossCarryforwardBefore, lossCarryforwardApplied: settlement.lossCarryforwardApplied, lossCarryforwardAfter: settlement.lossCarryforwardAfter,
          hwmBefore: settlement.hwmBefore, hwmAfter: settlement.hwmAfter, distributableProfit: settlement.distributableProfit, riskReserve: settlement.riskReserve, rewardPool: settlement.rewardPool, totalEffectiveXp: allocation.totalEffectiveXp, rewardDust: allocation.dust, settledAt: now, error: calculationError,
        } }),
        this.prisma.db.rewardAuditEvent.createMany({ data: [
          { rewardEpochId: epochId, type: 'INPUT_FROZEN', actorId, details: { mode: 'PAPER' } },
          { rewardEpochId: epochId, type: 'XP_SNAPSHOTTED', actorId, details: { mode: 'PAPER', asOf: epoch.endsAt.toISOString(), totalEffectiveXp: allocation.totalEffectiveXp } },
          { rewardEpochId: epochId, type: 'ALLOCATIONS_GENERATED', actorId, details: { mode: 'PAPER', allocationSum: allocation.allocationSum, dust: allocation.dust } },
        ] }),
      ]);
      return await this.review(epochId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'reward calculation failed';
      await this.prisma.db.rewardEpoch.update({ where: { id: epochId }, data: { status: 'REVIEW', error: message.slice(0, 1024) } });
      throw error;
    }
  }

  async finalize(epochId: string, actorId: string) {
    this.assertSafety();
    try { return await this.finalizeTransaction(epochId, actorId); }
    catch (error) {
      if ((error as { code?: string }).code !== 'P2034') throw error;
      const current = await this.prisma.db.rewardEpoch.findUniqueOrThrow({ where: { id: epochId }, select: { status: true } });
      if (current.status === 'FINALIZED') return { status: 'ALREADY_FINALIZED', epochId };
      return await this.finalizeTransaction(epochId, actorId);
    }
  }

  private async finalizeTransaction(epochId: string, actorId: string) {
    return this.prisma.db.$transaction(async (tx) => {
      const epoch = await tx.rewardEpoch.findUniqueOrThrow({ where: { id: epochId }, include: { sourceSnapshots: true, allocations: true } });
      if (epoch.status === 'FINALIZED') return { status: 'ALREADY_FINALIZED', epochId };
      if (epoch.status !== 'REVIEW' || epoch.error) throw new Error('epoch is not eligible for finalization');
      if (epoch.rewardPool.gt(0) && epoch.totalEffectiveXp.isZero()) throw new Error('zero effective XP cannot be finalized');
      await tx.userRewardAllocation.updateMany({ where: { rewardEpochId: epochId, status: 'PENDING' }, data: { status: 'AVAILABLE', availableAt: this.clock.now() } });
      const claimed = await tx.rewardEpoch.updateMany({ where: { id: epochId, status: 'REVIEW' }, data: { status: 'FINALIZED', finalizedAt: this.clock.now() } });
      if (claimed.count !== 1) return { status: 'ALREADY_FINALIZED', epochId };
      await tx.rewardFundState.upsert({ where: { mode: 'PAPER' }, create: { mode: 'PAPER', aggregateSettlementNav: epoch.spotEndNav.plus(epoch.futuresEndNav), highWaterMark: epoch.hwmAfter, lossCarryforward: epoch.lossCarryforwardAfter, cumulativeNetRealized: epoch.grossNetRealized, cumulativeDistributedProfit: epoch.rewardPool, lastEpochNumber: epoch.number, lastFinalizedEpochId: epoch.id }, update: { aggregateSettlementNav: epoch.spotEndNav.plus(epoch.futuresEndNav), highWaterMark: epoch.hwmAfter, lossCarryforward: epoch.lossCarryforwardAfter, cumulativeNetRealized: { increment: epoch.grossNetRealized }, cumulativeDistributedProfit: { increment: epoch.rewardPool }, lastEpochNumber: epoch.number, lastFinalizedEpochId: epoch.id } });
      for (const source of epoch.sourceSnapshots) await tx.rewardSettlementCursor.upsert({ where: { mode_strategyCode: { mode: 'PAPER', strategyCode: source.strategyCode } }, create: { mode: 'PAPER', strategyCode: source.strategyCode, realizedPnl: source.cumulativeRealizedPnl, grossRealizedPnl: source.cumulativeGrossRealizedPnl, fees: source.cumulativeFees, fundingPnl: source.cumulativeFundingPnl, slippageCost: source.cumulativeSlippageCost, liquidationPenalty: source.cumulativeLiquidationPenalty, nav: source.endNav }, update: { realizedPnl: source.cumulativeRealizedPnl, grossRealizedPnl: source.cumulativeGrossRealizedPnl, fees: source.cumulativeFees, fundingPnl: source.cumulativeFundingPnl, slippageCost: source.cumulativeSlippageCost, liquidationPenalty: source.cumulativeLiquidationPenalty, nav: source.endNav } });
      await tx.rewardAuditEvent.create({ data: { rewardEpochId: epochId, type: 'FINALIZED', actorId, details: { mode: 'PAPER', allocationCount: epoch.allocations.length } } });
      await tx.auditLog.create({ data: { actorId, action: 'PAPER_REWARD_EPOCH_FINALIZED', target: epochId, before: { status: 'REVIEW' }, after: { status: 'FINALIZED', rewardPool: epoch.rewardPool.toString() }, requestId: randomUUID() } });
      return { status: 'FINALIZED', epochId };
    }, { isolationLevel: 'Serializable' });
  }

  async cancel(epochId: string, actorId: string) {
    const epoch = await this.prisma.db.rewardEpoch.findUniqueOrThrow({ where: { id: epochId } });
    if (epoch.status === 'FINALIZED') throw new Error('finalized epoch cannot be cancelled');
    if (epoch.status !== 'REVIEW') throw new Error('only review epoch can be cancelled');
    await this.prisma.db.$transaction([
      this.prisma.db.rewardEpoch.update({ where: { id: epochId }, data: { status: 'CANCELLED' } }),
      this.prisma.db.userRewardAllocation.updateMany({ where: { rewardEpochId: epochId }, data: { status: 'CANCELLED' } }),
      this.prisma.db.rewardAuditEvent.create({ data: { rewardEpochId: epochId, type: 'CANCELLED', actorId, details: { mode: 'PAPER' } } }),
    ]);
    return { status: 'CANCELLED', epochId };
  }

  async review(epochId: string) {
    const epoch = await this.prisma.db.rewardEpoch.findUniqueOrThrow({ where: { id: epochId }, include: { allocations: true, sourceSnapshots: true } });
    const allocationSum = epoch.allocations.reduce((sum, row) => sum.plus(row.grossReward), new Decimal(0));
    return { ...this.serializeEpoch(epoch), userCount: epoch.allocations.length, allocationSum: allocationSum.toFixed(), dust: epoch.rewardDust.toString() };
  }

  async userRewards(userId: string) {
    const [currentEpoch, latestFinalizedEpoch, allocations] = await Promise.all([
      this.ensureCurrentEpoch(), this.prisma.db.rewardEpoch.findFirst({ where: { mode: 'PAPER', status: 'FINALIZED' }, orderBy: { number: 'desc' } }),
      this.prisma.db.userRewardAllocation.findMany({ where: { userId, mode: 'PAPER' }, include: { rewardEpoch: true }, orderBy: { createdAt: 'desc' } }),
    ]);
    const available = allocations.filter((row) => row.status === 'AVAILABLE').reduce((sum, row) => sum.plus(row.grossReward), new Decimal(0));
    const pending = allocations.filter((row) => row.status === 'PENDING').reduce((sum, row) => sum.plus(row.grossReward), new Decimal(0));
    const total = allocations.reduce((sum, row) => sum.plus(row.grossReward), new Decimal(0));
    return { mode: 'PAPER', currentEpoch: this.serializeEpoch(currentEpoch), latestFinalizedEpoch: latestFinalizedEpoch ? this.serializeEpoch(latestFinalizedEpoch) : null, availablePaperReward: available.toFixed(), pendingPaperReward: pending.toFixed(), totalPaperEarned: total.toFixed(), realWithdrawable: '0', allocations: allocations.map((row) => ({ epoch: row.rewardEpoch.number, period: `${row.rewardEpoch.startsAt.toISOString()}/${row.rewardEpoch.endsAt.toISOString()}`, mode: row.mode, grossReward: row.grossReward.toString(), xp: row.totalXp.toString(), globalXp: row.globalTotalXp.toString(), shareRatio: row.shareRatio.toString(), status: row.status, feePreview: row.withdrawalFee.toString(), netPreview: row.netReward.toString() })) };
  }

  async currentEpoch() { return this.serializeEpoch(await this.ensureCurrentEpoch()); }

  async listEpochs() {
    const epochs = await this.prisma.db.rewardEpoch.findMany({ where: { mode: 'PAPER' }, orderBy: { number: 'desc' }, take: 52 });
    return epochs.map((epoch) => this.serializeEpoch(epoch));
  }

  async epoch(id: string) {
    return this.serializeEpoch(await this.prisma.db.rewardEpoch.findUniqueOrThrow({ where: { id } }));
  }

  async endedEpochs() {
    await this.ensureCurrentEpoch();
    return this.prisma.db.rewardEpoch.findMany({ where: { mode: 'PAPER', status: 'OPEN', endsAt: { lte: this.clock.now() } }, orderBy: { number: 'asc' } });
  }

  private async captureBaseline(tx: Prisma.TransactionClient, strategyCode: string) {
    const strategy = await tx.strategy.findUnique({ where: { code: strategyCode }, include: { account: true } });
    const account = strategy?.account;
    const realized = new Decimal(account?.realizedPnl ?? 0);
    const fees = new Decimal(account?.fees ?? 0);
    const funding = new Decimal(account?.fundingPnl ?? 0);
    const slippage = new Decimal(account?.slippageCost ?? 0);
    const penalty = new Decimal(account?.liquidationPenalty ?? 0);
    const explicitGross = new Decimal(account?.grossRealizedPnl ?? 0);
    const gross = explicitGross.isZero() && !realized.isZero() ? realized.minus(funding).plus(fees).plus(slippage).plus(penalty) : explicitGross;
    return { strategyCode, nav: new Decimal(account?.nav ?? 0).toFixed(), realizedPnl: realized.toFixed(), grossRealizedPnl: gross.toFixed(), fees: fees.toFixed(), fundingPnl: funding.toFixed(), slippageCost: slippage.toFixed(), liquidationPenalty: penalty.toFixed() };
  }

  private sourceData(rewardEpochId: string, source: Awaited<ReturnType<StrategyAccountSettlementSource['getEpochMetrics']>>) { return { rewardEpochId, ...source }; }
  private serializeEpoch(epoch: { id: string; number: number; startsAt: Date; endsAt: Date; status: string; mode: string; spotNetRealized: Decimal; futuresNetRealized: Decimal; grossNetRealized: Decimal; lossCarryforwardBefore: Decimal; lossCarryforwardApplied: Decimal; lossCarryforwardAfter: Decimal; hwmBefore: Decimal; hwmAfter: Decimal; riskReserve: Decimal; rewardPool: Decimal; totalEffectiveXp: Decimal; rewardDust: Decimal; error: string | null }) { return { id: epoch.id, number: epoch.number, period: `${epoch.startsAt.toISOString()}/${epoch.endsAt.toISOString()}`, status: epoch.status, mode: epoch.mode, spotNetRealized: epoch.spotNetRealized.toString(), futuresNetRealized: epoch.futuresNetRealized.toString(), aggregateNetRealized: epoch.grossNetRealized.toString(), lossCarryforwardBefore: epoch.lossCarryforwardBefore.toString(), lossCarryforwardApplied: epoch.lossCarryforwardApplied.toString(), lossCarryforwardAfter: epoch.lossCarryforwardAfter.toString(), hwmBefore: epoch.hwmBefore.toString(), hwmAfter: epoch.hwmAfter.toString(), riskReserve: epoch.riskReserve.toString(), rewardPool: epoch.rewardPool.toString(), totalEffectiveXp: epoch.totalEffectiveXp.toString(), dust: epoch.rewardDust.toString(), error: epoch.error }; }
}
