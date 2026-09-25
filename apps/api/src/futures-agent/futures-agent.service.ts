import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Decimal } from 'decimal.js';
import {
  MockPerpMarketDataAdapter, PublicPerpMarketDataAdapter, PERP_SOURCE_PAIRS,
  type FuturesSymbol, type PerpMarketDataAdapter,
} from '@xgou/market-data';
import { evaluateFuturesTrendV1, type FuturesPositionInput } from '@xgou/strategy-engine';
import { deriveCircuitState, evaluateFuturesRisk, type CircuitState } from '@xgou/risk-engine';
import {
  applyPerpFill, calculateFundingPayment, calculatePeriodPnl, markPerpPosition,
  PaperPerpExchangeAdapter, rebalancePaperCapital, utcDayStart, utcWeekStart,
  type PaperPerpPositionState, type PerpAction, type PerpSide,
} from '@xgou/exchange-adapters';
import { PrismaService } from '../database/prisma.service.js';
import { SystemConfigService } from '../config/system-config.service.js';
import { resolveCircuitTransition } from '../spot-agent/spot-runtime.js';

const STRATEGY_CODE = 'FUTURES_TREND_V1';
const SYMBOLS: readonly FuturesSymbol[] = ['BTC/USDC-PERP', 'ETH/USDC-PERP', 'SOL/USDC-PERP'];

@Injectable()
export class FuturesAgentService {
  private readonly market: PerpMarketDataAdapter = process.env.FUTURES_MARKET_DATA_SOURCE === 'public'
    ? new PublicPerpMarketDataAdapter()
    : new MockPerpMarketDataAdapter();

  constructor(private readonly prisma: PrismaService, private readonly configs: SystemConfigService) {}

  async snapshot() {
    const strategy = await this.prisma.db.strategy.findUnique({
      where: { code: STRATEGY_CODE },
      include: {
        account: { include: { futuresPositions: { where: { status: 'OPEN' }, orderBy: { symbol: 'asc' }, include: { fundingPayments: { orderBy: { fundedAt: 'desc' }, take: 3 } } }, navSnapshots: { orderBy: { capturedAt: 'desc' }, take: 30 } } },
        circuitBreaker: true, cycles: { orderBy: { startedAt: 'desc' }, take: 1 },
      },
    });
    if (!strategy?.account) return this.emptySnapshot();
    const trades = await this.prisma.db.paperExecution.findMany({ where: { order: { proposal: { strategyId: strategy.id } } }, include: { order: true }, orderBy: { executedAt: 'desc' }, take: 20 });
    const funding = await this.prisma.db.fundingPayment.findMany({ where: { position: { account: { strategyId: strategy.id } } }, include: { position: true }, orderBy: { fundedAt: 'desc' }, take: 20 });
    const account = strategy.account;
    return {
      mode: 'PAPER', strategy: strategy.code, status: strategy.status, circuitState: strategy.circuitBreaker?.status ?? 'RUNNING',
      allocatedCapital: account.allocatedCapital.toString(), activeCapital: account.activeCapital.toString(), reserve: account.reserveBalance.toString(),
      cash: account.cashBalance.toString(), equity: account.equity.toString(), marginUsed: account.marginUsed.toString(), availableMargin: account.availableMargin.toString(),
      marginUsage: account.nav.isZero() ? '0' : account.marginUsed.div(account.nav).toString(), grossExposure: account.grossExposure.toString(), netExposure: account.netExposure.toString(), nav: account.nav.toString(),
      leverage: account.futuresPositions.reduce((maximum, position) => Decimal.max(maximum, position.leverage), new Decimal(0)).toString(), maxLeverage: '3',
      realizedPnl: account.realizedPnl.toString(), unrealizedPnl: account.unrealizedPnl.toString(), fundingPnl: account.fundingPnl.toString(), fees: account.fees.toString(),
      dailyPnl: account.dailyPnl.toString(), weeklyPnl: account.weeklyPnl.toString(), drawdown: account.drawdown.toString(), highWaterMark: account.highWaterMark.toString(), consecutiveLosses: account.consecutiveLosses,
      positions: account.futuresPositions.map((position) => ({
        id: position.id, symbol: position.symbol, priceSourcePair: position.priceSourcePair, side: position.side, quantity: position.quantity.toString(), entry: position.averageEntry.toString(), mark: position.markPrice.toString(), leverage: position.leverage.toString(), notional: position.notional.toString(), margin: position.initialMargin.toString(), unrealizedPnl: position.unrealizedPnl.toString(), stop: position.stopLoss.toString(), trailingStop: position.trailingStop?.toString() ?? null, liquidationPrice: position.liquidationPrice.toString(), liquidationDistance: position.liquidationDistance.toString(), status: position.status, markedAt: position.markedAt?.toISOString() ?? null,
      })),
      recentTrades: trades.map((fill) => ({ id: fill.id, symbol: fill.order.symbol, side: fill.order.side, quantity: fill.quantity.toString(), price: fill.fillPrice.toString(), fee: fill.fee.toString(), executedAt: fill.executedAt.toISOString(), mode: 'PAPER' })),
      fundingRate: funding[0]?.fundingRate.toString() ?? '0', nextFunding: new Date((Math.floor(Date.now() / (8 * 60 * 60 * 1_000)) + 1) * 8 * 60 * 60 * 1_000).toISOString(),
      recentFunding: funding.map((item) => ({ id: item.id, symbol: item.position.symbol, fundingRate: item.fundingRate.toString(), notional: item.notional.toString(), payment: item.payment.toString(), timestamp: item.fundedAt.toISOString() })),
      navHistory: account.navSnapshots.map((item) => ({ label: item.capturedAt.toISOString(), value: item.nav.toString() })).reverse(),
      lastCycle: strategy.cycles[0] ? { id: strategy.cycles[0].cycleId, status: strategy.cycles[0].status, startedAt: strategy.cycles[0].startedAt.toISOString(), error: strategy.cycles[0].error } : null,
    };
  }

  async runCycle(cycleId = `${STRATEGY_CODE}:${String(Math.floor(Date.now() / 60_000))}`): Promise<{ readonly status: string; readonly cycleId: string }> {
    const strategy = await this.ensureStrategy();
    if (strategy.status === 'DRAFT' || strategy.status === 'DISABLED') return { status: 'SKIPPED', cycleId };
    const existing = await this.prisma.db.strategyCycle.findUnique({ where: { strategyId_cycleId: { strategyId: strategy.id, cycleId } } });
    if (existing) return { status: 'IDEMPOTENT', cycleId };
    await this.prisma.db.strategyCycle.create({ data: { strategyId: strategy.id, cycleId } });
    try {
      await this.syncCapital(strategy.id);
      if (!(await this.market.healthCheck())) {
        await this.persistCircuit(strategy.id, 'PAUSED', 'DATA_FEED_UNHEALTHY');
        await this.markAccount(strategy.id);
        await this.completeCycle(strategy.id, cycleId);
        return { status: 'COMPLETED', cycleId };
      }
      const healthy = await this.markAndFund(strategy.id, cycleId);
      if (!healthy) {
        await this.persistCircuit(strategy.id, 'PAUSED', 'DATA_FEED_STALE');
        await this.markAccount(strategy.id);
        await this.completeCycle(strategy.id, cycleId);
        return { status: 'COMPLETED', cycleId };
      }
      let metrics = await this.markAccount(strategy.id);
      await this.refreshCircuit(strategy.id, metrics);
      for (const symbol of SYMBOLS) await this.evaluateSymbol(strategy.id, cycleId, symbol);
      metrics = await this.markAccount(strategy.id);
      await this.refreshCircuit(strategy.id, metrics);
      await this.completeCycle(strategy.id, cycleId);
      return { status: 'COMPLETED', cycleId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown futures cycle failure';
      await this.prisma.db.strategyCycle.update({ where: { strategyId_cycleId: { strategyId: strategy.id, cycleId } }, data: { status: 'FAILED', finishedAt: new Date(), error: message.slice(0, 1024) } });
      await this.prisma.db.riskEvent.create({ data: { strategyId: strategy.id, severity: 'CRITICAL', code: 'FUTURES_CYCLE_FAILED', message: message.slice(0, 512), details: { cycleId, mode: 'PAPER' } } });
      throw error;
    }
  }

  async setState(state: 'PAPER' | 'PAUSED' | 'RISK_OFF', actorId: string): Promise<void> {
    const strategy = await this.ensureStrategy();
    const before = strategy.status;
    await this.prisma.db.$transaction([
      this.prisma.db.strategy.update({ where: { id: strategy.id }, data: { status: state } }),
      this.prisma.db.circuitBreakerState.upsert({ where: { strategyId: strategy.id }, create: { strategyId: strategy.id, status: state === 'PAPER' ? 'RUNNING' : state, reason: `ADMIN_${state}`, triggeredAt: state === 'PAPER' ? null : new Date() }, update: { status: state === 'PAPER' ? 'RUNNING' : state, reason: `ADMIN_${state}`, triggeredAt: state === 'PAPER' ? null : new Date() } }),
      this.prisma.db.auditLog.create({ data: { actorId, action: `FUTURES_AGENT_${state}`, target: strategy.code, before: { status: before }, after: { status: state }, requestId: randomUUID() } }),
    ]);
  }

  private ensureStrategy() {
    return this.prisma.db.strategy.upsert({ where: { code: STRATEGY_CODE }, create: { code: STRATEGY_CODE, name: 'Futures Trend V1', type: 'FUTURES_TREND', fundDomain: 'FUTURES', status: 'DRAFT', riskProfile: { paperOnly: true, oneWayMode: true, mandatoryStop: true }, account: { create: {} }, circuitBreaker: { create: {} } }, update: {} });
  }

  private async syncCapital(strategyId: string): Promise<void> {
    const [entries, config, account] = await Promise.all([
      this.prisma.db.ledgerEntry.findMany({ where: { account: { code: 'futures-treasury:USDC' } } }),
      this.configs.current(), this.prisma.db.strategyAccount.findUniqueOrThrow({ where: { strategyId } }),
    ]);
    const capital = entries.reduce((sum, row) => row.side === 'DEBIT' ? sum.plus(row.amount.toString()) : sum.minus(row.amount.toString()), new Decimal(0));
    const balanced = rebalancePaperCapital({ allocatedCapital: account.allocatedCapital.toString(), activeCapital: account.activeCapital.toString(), cashBalance: account.cashBalance.toString(), reserveBalance: account.reserveBalance.toString() }, capital, config.values.futuresLiquidityReserve);
    const delta = capital.minus(account.allocatedCapital);
    await this.prisma.db.strategyAccount.update({ where: { id: account.id }, data: { ...balanced, nav: Decimal.max(0, account.nav.plus(delta)).toString(), equity: Decimal.max(0, account.equity.plus(delta)).toString(), highWaterMark: Decimal.max(0, account.highWaterMark.plus(Decimal.max(0, delta))).toString(), availableMargin: Decimal.max(0, new Decimal(balanced.cashBalance).minus(account.marginUsed)).toString() } });
  }

  private async evaluateSymbol(strategyId: string, cycleId: string, symbol: FuturesSymbol): Promise<void> {
    const [candles, funding, stats, account, circuit, config] = await Promise.all([
      this.market.getOHLCV(symbol, '1h', 120), this.market.getFundingRate(symbol), this.market.get24hStats(symbol),
      this.prisma.db.strategyAccount.findUniqueOrThrow({ where: { strategyId }, include: { futuresPositions: { where: { status: 'OPEN' } } } }),
      this.prisma.db.circuitBreakerState.findUnique({ where: { strategyId } }), this.configs.current(),
    ]);
    const position = account.futuresPositions.find((item) => item.symbol === symbol);
    const positionInput: FuturesPositionInput | undefined = position ? { side: position.side, stopLoss: position.stopLoss.toString(), ...(position.highestMarkPrice ? { highestMarkPrice: position.highestMarkPrice.toString() } : {}), ...(position.lowestMarkPrice ? { lowestMarkPrice: position.lowestMarkPrice.toString() } : {}) } : undefined;
    const signal = evaluateFuturesTrendV1(symbol, candles, funding.value, {
      emaFastPeriod: 20, emaMediumPeriod: 50, emaSlowPeriod: 100, atrPeriod: 14, rsiPeriod: 14, momentumPeriod: 20,
      minTrendStrength: '0.001', maxAtrRatio: config.values.futuresMaxVolatility, longRsiMax: '75', shortRsiMin: '25', maxFundingRateAbs: config.values.futuresFundingRateLimit,
      stopAtrMultiple: config.values.futuresStopAtrMultiple, targetAtrMultiple: config.values.futuresTargetAtrMultiple, trailingAtrMultiple: config.values.futuresTrailingAtrMultiple,
    }, positionInput);
    if (position && signal.trailingStop) await this.prisma.db.futuresPosition.update({ where: { id: position.id }, data: { trailingStop: signal.trailingStop, stopLoss: signal.trailingStop } });
    const signalRow = await this.prisma.db.tradeSignal.create({ data: { strategyId, cycleId, symbol, type: signal.signalType, strength: signal.strength, price: signal.price, indicators: signal.indicators, rationale: { reason: signal.reason, stopLoss: signal.stopLoss, takeProfit: signal.takeProfit, leverage: signal.requestedLeverage } } });
    await this.activity(strategyId, 'SIGNAL', 'Futures Agent', `${symbol} ${signal.signalType}: ${signal.reason}`, 'PAPER SIGNAL');
    if (signal.signalType === 'HOLD') return;
    const side: PerpAction = signal.signalType === 'LONG' ? 'OPEN_LONG' : signal.signalType === 'SHORT' ? 'OPEN_SHORT' : position?.side === 'LONG' ? 'CLOSE_LONG' : 'CLOSE_SHORT';
    const requested = position ? position.notional.toString() : Decimal.min(config.values.futuresMaxOrderNotional, account.activeCapital.mul('0.25')).toFixed();
    const proposal = await this.prisma.db.tradeProposal.create({ data: { strategyId, signalId: signalRow.id, cycleId, symbol, side, requestedNotional: requested, requestedLeverage: signal.requestedLeverage, referencePrice: signal.price, stopLoss: signal.stopLoss, takeProfit: signal.takeProfit, maxSlippage: new Decimal(config.values.futuresMaxSlippageBps).div(10_000).toString(), reason: signal.reason } });
    const assetExposure = position?.notional.toString() ?? '0';
    const decision = evaluateFuturesRisk({ symbol, side, requestedNotional: requested, requestedLeverage: signal.requestedLeverage, expectedPrice: signal.price, stopLoss: signal.stopLoss, maxSlippage: proposal.maxSlippage?.toString() ?? '0', marketDataTimestamp: signal.marketDataTimestamp }, {
      equity: account.nav.toString(), availableMargin: account.availableMargin.toString(), marginUsed: account.marginUsed.toString(), grossExposure: account.grossExposure.toString(), netExposure: account.netExposure.toString(), assetExposure, dailyPnlRatio: account.dailyPnlRatio.toString(), weeklyPnlRatio: account.weeklyPnlRatio.toString(), drawdown: account.drawdown.toString(), fundingRate: funding.value, volatility: signal.indicators.volatility ?? '0', marketLiquidity: stats.quoteVolume, estimatedSlippage: new Decimal(config.values.futuresBaseSlippageBps).div(10_000).toString(), now: signal.marketDataTimestamp, circuitState: circuit?.status ?? 'RUNNING',
    }, {
      allowedAssets: SYMBOLS, maxLeverage: config.values.maxFuturesLeverage, maxPositionRisk: config.values.maxFuturesPositionRisk, maxAssetExposure: config.values.maxFuturesAssetExposure, maxGrossExposure: config.values.futuresMaxGrossExposure, maxNetExposure: config.values.futuresMaxNetExposure, maxMarginUsage: config.values.futuresMaxMarginUsage, minLiquidationDistance: config.values.minLiquidationDistance, maxOrderNotional: config.values.futuresMaxOrderNotional, maxDailyLoss: config.values.maxDailyLoss, maxWeeklyLoss: config.values.maxWeeklyLoss, maxDrawdown: config.values.maxDrawdown, maxFundingRateAbs: config.values.futuresFundingRateLimit, maxSlippage: new Decimal(config.values.futuresMaxSlippageBps).div(10_000).toString(), maxVolatility: config.values.futuresMaxVolatility, minLiquidity: config.values.futuresMinLiquidityUsd, stalePriceSeconds: config.values.futuresDataStaleSeconds, reducedRiskLeverage: config.values.futuresReducedRiskLeverage, maintenanceMarginRatio: config.values.futuresMaintenanceMarginRatio, liquidationFeeBuffer: new Decimal(config.values.futuresLiquidationPenaltyBps).div(10_000).toString(),
    });
    const risk = await this.prisma.db.riskDecision.create({ data: { proposalId: proposal.id, decision: decision.decision, requestedNotional: requested, approvedNotional: decision.approvedNotional, reasonCodes: [...decision.reasonCodes], metrics: { ...decision.riskMetrics, approvedLeverage: decision.approvedLeverage, liquidationDistance: decision.projectedLiquidationDistance, maxLossAtStop: decision.maxLossAtStop } } });
    await this.prisma.db.tradeProposal.update({ where: { id: proposal.id }, data: { approvedNotional: decision.approvedNotional, approvedLeverage: decision.approvedLeverage, status: decision.decision === 'REJECTED' ? 'RISK_REJECTED' : decision.decision === 'REDUCED' ? 'RISK_REDUCED' : 'RISK_APPROVED' } });
    await this.activity(strategyId, 'RISK', 'Risk Engine', `${symbol} ${decision.decision}`, decision.reasonCodes.join(', ') || 'APPROVED');
    if (decision.decision !== 'REJECTED') await this.execute(strategyId, account.id, proposal.id, risk.id, cycleId, symbol, side, signal.price, decision.approvedNotional, decision.approvedLeverage, signal.stopLoss, signal.takeProfit, stats.quoteVolume, position ?? null);
  }

  private async execute(strategyId: string, accountId: string, proposalId: string, riskDecisionId: string, cycleId: string, symbol: FuturesSymbol, action: PerpAction, price: string, notional: string, leverage: string, stopLoss: string | null, takeProfit: string | null, liquidity: string, existing: Awaited<ReturnType<typeof this.prisma.db.futuresPosition.findFirst>>): Promise<void> {
    if ((action === 'OPEN_LONG' || action === 'OPEN_SHORT') && stopLoss === null) throw new Error('futures open requires stop loss');
    const config = (await this.configs.current()).values;
    const fill = new PaperPerpExchangeAdapter({ takerFeeBps: config.futuresTakerFeeBps, baseSlippageBps: config.futuresBaseSlippageBps, liquidityImpactBps: '10', maxSlippageBps: config.futuresMaxSlippageBps }).execute(action, notional, price, liquidity, action.startsWith('OPEN_') ? undefined : existing?.quantity.toString());
    const side: PerpSide = action.includes('LONG') ? 'LONG' : 'SHORT';
    const current: PaperPerpPositionState | null = existing ? { symbol: existing.symbol, side: existing.side, quantity: existing.quantity.toString(), averageEntryPrice: existing.averageEntry.toString(), leverage: existing.leverage.toString(), realizedPnl: existing.realizedPnl.toString(), fundingPnl: existing.fundingPnl.toString(), fees: existing.fees.toString() } : null;
    const accounting = applyPerpFill(current, side, leverage, fill);
    const account = await this.prisma.db.strategyAccount.findUniqueOrThrow({ where: { id: accountId } });
    const orderSide = action === 'OPEN_LONG' || action === 'REDUCE_SHORT' || action === 'CLOSE_SHORT' ? 'BUY' : 'SELL';
    const order = await this.prisma.db.paperOrder.create({ data: { proposalId, riskDecisionId, cycleId, symbol, side: orderSide, status: 'RISK_APPROVED', quantity: fill.quantity, notional: fill.notional, referencePrice: price, leverage, reduceOnly: !action.startsWith('OPEN_') } });
    const realized = new Decimal(account.realizedPnl).plus(accounting.realizedPnlDelta);
    const fees = new Decimal(account.fees).plus(fill.fee);
    const cash = new Decimal(account.cashBalance).plus(accounting.realizedPnlDelta);
    const margin = Decimal.max(0, new Decimal(account.marginUsed).plus(accounting.marginDelta));
    await this.prisma.db.$transaction([
      this.prisma.db.paperOrder.update({ where: { id: order.id }, data: { status: 'FILLED' } }),
      this.prisma.db.paperExecution.create({ data: { orderId: order.id, fillPrice: fill.price, quantity: fill.quantity, grossNotional: fill.notional, fee: fill.fee, slippageBps: fill.slippageBps } }),
      this.prisma.db.tradeProposal.update({ where: { id: proposalId }, data: { status: 'EXECUTED' } }),
      this.prisma.db.strategyAccount.update({ where: { id: accountId }, data: { realizedPnl: realized.toString(), fees: fees.toString(), cashBalance: cash.toString(), marginUsed: margin.toString(), availableMargin: Decimal.max(0, cash.minus(margin)).toString(), consecutiveLosses: accounting.loss ? { increment: 1 } : accounting.realizedPnlDelta !== '0' ? 0 : account.consecutiveLosses } }),
    ]);
    if (accounting.position) {
      const marked = markPerpPosition(accounting.position, fill.price, config.futuresMaintenanceMarginRatio, new Decimal(config.futuresLiquidationPenaltyBps).div(10_000));
      await this.prisma.db.futuresPosition.upsert({ where: { strategyAccountId_symbol: { strategyAccountId: accountId, symbol } }, create: { strategyAccountId: accountId, symbol, priceSourcePair: PERP_SOURCE_PAIRS[symbol], side, quantity: accounting.position.quantity, averageEntry: accounting.position.averageEntryPrice, markPrice: fill.price, leverage: accounting.position.leverage, notional: marked.notional, initialMargin: marked.initialMargin, maintenanceMargin: marked.maintenanceMargin, liquidationPrice: marked.liquidationPrice, liquidationDistance: marked.liquidationDistance, realizedPnl: accounting.position.realizedPnl, fundingPnl: accounting.position.fundingPnl, fees: accounting.position.fees, stopLoss: stopLoss ?? fill.price, takeProfit, trailingStop: stopLoss, highestMarkPrice: side === 'LONG' ? fill.price : null, lowestMarkPrice: side === 'SHORT' ? fill.price : null, markedAt: new Date() }, update: { status: 'OPEN', side, quantity: accounting.position.quantity, averageEntry: accounting.position.averageEntryPrice, markPrice: fill.price, leverage: accounting.position.leverage, notional: marked.notional, initialMargin: marked.initialMargin, maintenanceMargin: marked.maintenanceMargin, liquidationPrice: marked.liquidationPrice, liquidationDistance: marked.liquidationDistance, realizedPnl: accounting.position.realizedPnl, fees: accounting.position.fees, ...(action.startsWith('OPEN_') ? { stopLoss: stopLoss ?? fill.price, takeProfit, trailingStop: stopLoss } : {}), markedAt: new Date(), closedAt: null } });
    } else if (existing) {
      await this.prisma.db.futuresPosition.update({ where: { id: existing.id }, data: { status: 'CLOSED', quantity: 0, notional: 0, initialMargin: 0, maintenanceMargin: 0, unrealizedPnl: 0, realizedPnl: new Decimal(existing.realizedPnl).plus(accounting.realizedPnlDelta).toString(), fees: new Decimal(existing.fees).plus(fill.fee).toString(), closedAt: new Date(), markedAt: new Date() } });
    }
    await this.activity(strategyId, 'EXECUTION', 'Execution Engine', `${action} ${fill.quantity} ${symbol} @ ${fill.price}`, 'PAPER FILLED');
  }

  private async markAndFund(strategyId: string, cycleId: string): Promise<boolean> {
    const [account, config] = await Promise.all([this.prisma.db.strategyAccount.findUniqueOrThrow({ where: { strategyId }, include: { futuresPositions: { where: { status: 'OPEN' } } } }), this.configs.current()]);
    const rows = await Promise.all(account.futuresPositions.map(async (position) => ({ position, mark: await this.market.getMarkPrice(position.symbol as FuturesSymbol), funding: await this.market.getFundingRate(position.symbol as FuturesSymbol) })));
    const now = Date.now();
    if (rows.some(({ mark, funding }) => now - mark.exchangeTimestamp > config.values.futuresDataStaleSeconds * 1_000 || now - funding.exchangeTimestamp > config.values.futuresDataStaleSeconds * 1_000)) return false;
    for (const { position, mark, funding } of rows) {
      const state: PaperPerpPositionState = { symbol: position.symbol, side: position.side, quantity: position.quantity.toString(), averageEntryPrice: position.averageEntry.toString(), leverage: position.leverage.toString(), realizedPnl: position.realizedPnl.toString(), fundingPnl: position.fundingPnl.toString(), fees: position.fees.toString() };
      const marked = markPerpPosition(state, mark.value, config.values.futuresMaintenanceMarginRatio, new Decimal(config.values.futuresLiquidationPenaltyBps).div(10_000));
      if (marked.liquidated) { await this.liquidate(strategyId, account.id, position, mark.value, cycleId); continue; }
      const highest = position.side === 'LONG' ? Decimal.max(position.highestMarkPrice ?? mark.value, mark.value).toString() : position.highestMarkPrice?.toString() ?? null;
      const lowest = position.side === 'SHORT' ? Decimal.min(position.lowestMarkPrice ?? mark.value, mark.value).toString() : position.lowestMarkPrice?.toString() ?? null;
      await this.prisma.db.futuresPosition.update({ where: { id: position.id }, data: { markPrice: mark.value, notional: marked.notional, initialMargin: marked.initialMargin, maintenanceMargin: marked.maintenanceMargin, unrealizedPnl: marked.unrealizedPnl, liquidationPrice: marked.liquidationPrice, liquidationDistance: marked.liquidationDistance, highestMarkPrice: highest, lowestMarkPrice: lowest, markedAt: new Date(mark.exchangeTimestamp) } });
      const bucket = Math.floor(now / (8 * 60 * 60 * 1_000));
      const idempotencyKey = `${position.id}:${String(bucket)}`;
      const exists = await this.prisma.db.fundingPayment.findUnique({ where: { idempotencyKey } });
      if (!exists) {
        const payment = calculateFundingPayment(position.side, marked.notional, funding.value);
        await this.prisma.db.$transaction([
          this.prisma.db.fundingPayment.create({ data: { positionId: position.id, idempotencyKey, fundingRate: funding.value, notional: marked.notional, payment, fundedAt: new Date(now) } }),
          this.prisma.db.futuresPosition.update({ where: { id: position.id }, data: { fundingPnl: { increment: payment } } }),
          this.prisma.db.strategyAccount.update({ where: { id: account.id }, data: { fundingPnl: { increment: payment }, cashBalance: { increment: payment } } }),
        ]);
        await this.activity(strategyId, 'EXECUTION', 'Funding Engine', `${position.symbol} funding payment ${payment} USDC`, 'PAPER FUNDING');
      }
    }
    return true;
  }

  private async liquidate(strategyId: string, accountId: string, position: Awaited<ReturnType<typeof this.prisma.db.futuresPosition.findFirst>> & {}, markPrice: string, cycleId: string): Promise<void> {
    const config = (await this.configs.current()).values;
    const penalty = new Decimal(position.notional).mul(config.futuresLiquidationPenaltyBps).div(10_000);
    const pnl = position.side === 'LONG' ? new Decimal(markPrice).minus(position.averageEntry).mul(position.quantity) : position.averageEntry.minus(markPrice).mul(position.quantity);
    const realized = pnl.minus(penalty);
    await this.prisma.db.$transaction([
      this.prisma.db.futuresPosition.update({ where: { id: position.id }, data: { status: 'LIQUIDATED', markPrice, unrealizedPnl: 0, realizedPnl: { increment: realized.toString() }, quantity: 0, notional: 0, initialMargin: 0, closedAt: new Date(), markedAt: new Date() } }),
      this.prisma.db.futuresLiquidation.create({ data: { positionId: position.id, cycleId: `${cycleId}:${position.symbol}`, liquidationPrice: position.liquidationPrice, fillPrice: markPrice, penalty: penalty.toString(), realizedLoss: realized.abs().toString() } }),
      this.prisma.db.strategyAccount.update({ where: { id: accountId }, data: { realizedPnl: { increment: realized.toString() }, cashBalance: { increment: realized.toString() }, marginUsed: { decrement: position.initialMargin }, consecutiveLosses: { increment: 1 } } }),
      this.prisma.db.riskEvent.create({ data: { strategyId, severity: 'CRITICAL', code: 'PAPER_LIQUIDATION', message: `${position.symbol} paper position liquidated`, details: { cycleId, markPrice, penalty: penalty.toString(), mode: 'PAPER' } } }),
      this.prisma.db.circuitBreakerState.upsert({ where: { strategyId }, create: { strategyId, status: 'RISK_OFF', reason: 'PAPER_LIQUIDATION', triggeredAt: new Date() }, update: { status: 'RISK_OFF', reason: 'PAPER_LIQUIDATION', triggeredAt: new Date() } }),
    ]);
    await this.activity(strategyId, 'RISK', 'Risk Engine', `${position.symbol} paper liquidation`, 'CRITICAL · RISK_OFF');
  }

  private async markAccount(strategyId: string) {
    const account = await this.prisma.db.strategyAccount.findUniqueOrThrow({ where: { strategyId }, include: { futuresPositions: { where: { status: 'OPEN' } } } });
    const unrealized = account.futuresPositions.reduce((sum, item) => sum.plus(item.unrealizedPnl), new Decimal(0));
    const gross = account.futuresPositions.reduce((sum, item) => sum.plus(item.notional), new Decimal(0));
    const net = account.futuresPositions.reduce((sum, item) => sum.plus(item.side === 'LONG' ? item.notional : item.notional.neg()), new Decimal(0));
    const margin = account.futuresPositions.reduce((sum, item) => sum.plus(item.initialMargin), new Decimal(0));
    const nav = account.cashBalance.plus(account.reserveBalance).plus(unrealized);
    const highWaterMark = Decimal.max(account.highWaterMark, nav);
    const drawdown = highWaterMark.isZero() ? new Decimal(0) : nav.minus(highWaterMark).div(highWaterMark);
    const now = new Date();
    const daily = calculatePeriodPnl(nav, { openingNav: account.dailyOpeningNav.toString(), baselineAt: account.dailyBaselineAt }, utcDayStart(now));
    const weekly = calculatePeriodPnl(nav, { openingNav: account.weeklyOpeningNav.toString(), baselineAt: account.weeklyBaselineAt }, utcWeekStart(now));
    await this.prisma.db.$transaction([
      this.prisma.db.strategyAccount.update({ where: { id: account.id }, data: { nav: nav.toString(), equity: nav.toString(), highWaterMark: highWaterMark.toString(), unrealizedPnl: unrealized.toString(), drawdown: drawdown.toString(), grossExposure: gross.toString(), netExposure: net.toString(), marginUsed: margin.toString(), availableMargin: Decimal.max(0, account.cashBalance.minus(margin)).toString(), dailyOpeningNav: daily.openingNav, dailyBaselineAt: daily.baselineAt, dailyPnl: daily.pnl, dailyPnlRatio: daily.pnlRatio, weeklyOpeningNav: weekly.openingNav, weeklyBaselineAt: weekly.baselineAt, weeklyPnl: weekly.pnl, weeklyPnlRatio: weekly.pnlRatio } }),
      this.prisma.db.navSnapshot.create({ data: { strategyAccountId: account.id, nav: nav.toString(), cash: account.cashBalance.toString(), reserve: account.reserveBalance.toString(), exposure: gross.toString(), realizedPnl: account.realizedPnl.toString(), unrealizedPnl: unrealized.toString(), drawdown: drawdown.toString() } }),
    ]);
    return { dailyPnlRatio: daily.pnlRatio, weeklyPnlRatio: weekly.pnlRatio, drawdown: drawdown.toString(), consecutiveLosses: account.consecutiveLosses };
  }

  private async refreshCircuit(strategyId: string, metrics: { readonly dailyPnlRatio: string; readonly weeklyPnlRatio: string; readonly drawdown: string; readonly consecutiveLosses: number }): Promise<void> {
    const [config, persisted] = await Promise.all([this.configs.current(), this.prisma.db.circuitBreakerState.findUnique({ where: { strategyId } })]);
    let derived = deriveCircuitState(metrics.dailyPnlRatio, metrics.drawdown, { maxDailyLoss: config.values.maxDailyLoss, pauseDailyLoss: config.values.maxDailyLoss, maxDrawdown: config.values.maxDrawdown }, true, metrics.weeklyPnlRatio, config.values.maxWeeklyLoss);
    if (metrics.consecutiveLosses >= config.values.futuresMaxConsecutiveLosses) derived = 'PAUSED';
    const next = resolveCircuitTransition(persisted?.status ?? 'RUNNING', persisted?.reason ?? null, derived);
    if (next !== (persisted?.status ?? 'RUNNING')) await this.persistCircuit(strategyId, next, metrics.consecutiveLosses >= config.values.futuresMaxConsecutiveLosses ? 'MAX_CONSECUTIVE_LOSSES' : `AUTO_${next}`);
  }

  private async persistCircuit(strategyId: string, state: CircuitState, reason: string): Promise<void> {
    const current = await this.prisma.db.circuitBreakerState.findUnique({ where: { strategyId } });
    if (current?.status === state && current.reason === reason) return;
    const severity = state === 'RISK_OFF' || state === 'PAUSED' ? 'CRITICAL' : state === 'REDUCED_RISK' ? 'WARNING' : 'INFO';
    await this.prisma.db.$transaction([
      this.prisma.db.circuitBreakerState.upsert({ where: { strategyId }, create: { strategyId, status: state, reason, triggeredAt: state === 'RUNNING' ? null : new Date() }, update: { status: state, reason, triggeredAt: state === 'RUNNING' ? null : new Date() } }),
      this.prisma.db.riskEvent.create({ data: { strategyId, severity, code: `FUTURES_CIRCUIT_${state}`, message: `Futures circuit changed from ${current?.status ?? 'RUNNING'} to ${state}`, details: { before: current?.status ?? 'RUNNING', after: state, reason, mode: 'PAPER' } } }),
      this.prisma.db.auditLog.create({ data: { actorId: null, action: 'FUTURES_CIRCUIT_TRANSITION', target: STRATEGY_CODE, before: { status: current?.status ?? 'RUNNING' }, after: { status: state, reason }, requestId: randomUUID() } }),
    ]);
  }

  private completeCycle(strategyId: string, cycleId: string) { return this.prisma.db.strategyCycle.update({ where: { strategyId_cycleId: { strategyId, cycleId } }, data: { status: 'COMPLETED', finishedAt: new Date() } }); }
  private activity(strategyId: string, type: 'SIGNAL' | 'RISK' | 'EXECUTION', agentName: string, message: string, status: string) { return this.prisma.db.strategyActivity.create({ data: { strategyId, type, agentName, message, status, metadata: { mode: 'PAPER', fundDomain: 'FUTURES' } } }); }
  private emptySnapshot() { return { mode: 'PAPER', strategy: STRATEGY_CODE, status: 'DRAFT', circuitState: 'RUNNING', allocatedCapital: '0', activeCapital: '0', reserve: '0', cash: '0', equity: '0', marginUsed: '0', availableMargin: '0', marginUsage: '0', grossExposure: '0', netExposure: '0', nav: '0', leverage: '0', maxLeverage: '3', realizedPnl: '0', unrealizedPnl: '0', fundingPnl: '0', fundingRate: '0', nextFunding: null, fees: '0', dailyPnl: '0', weeklyPnl: '0', drawdown: '0', highWaterMark: '0', consecutiveLosses: 0, positions: [], recentTrades: [], recentFunding: [], navHistory: [], lastCycle: null }; }
}
