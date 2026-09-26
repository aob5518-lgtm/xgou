import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { MockMarketDataAdapter, PublicMarketDataAdapter, type MarketDataAdapter, type SpotSymbol } from '@xgou/market-data';
import { evaluateSpotSwingV1 } from '@xgou/strategy-engine';
import { deriveCircuitState, evaluateSpotRisk, type CircuitState } from '@xgou/risk-engine';
import {
  applyPaperFill, calculatePeriodPnl, markPaperNav, PaperSpotExchangeAdapter,
  rebalancePaperCapital, utcDayStart, utcWeekStart,
} from '@xgou/exchange-adapters';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { SystemConfigService } from '../config/system-config.service.js';
import { resolveCircuitTransition } from './spot-runtime.js';

const STRATEGY_CODE = 'SPOT_SWING_V1';
const SYMBOLS: readonly SpotSymbol[] = ['BTC/USDC', 'ETH/USDC', 'SOL/USDC'];

@Injectable()
export class SpotAgentService {
  private readonly market: MarketDataAdapter = process.env.MARKET_DATA_SOURCE === 'public'
    ? new PublicMarketDataAdapter()
    : new MockMarketDataAdapter();

  constructor(private readonly prisma: PrismaService, private readonly configs: SystemConfigService) {}

  async snapshot() {
    const strategy = await this.prisma.db.strategy.findUnique({
      where: { code: STRATEGY_CODE },
      include: {
        account: { include: { positions: { where: { status: 'OPEN' }, orderBy: { symbol: 'asc' } }, navSnapshots: { orderBy: { capturedAt: 'desc' }, take: 30 } } },
        circuitBreaker: true,
        cycles: { orderBy: { startedAt: 'desc' }, take: 1 },
      },
    });
    if (!strategy?.account) return this.emptySnapshot();
    const trades = await this.prisma.db.paperExecution.findMany({ include: { order: true }, orderBy: { executedAt: 'desc' }, take: 20 });
    const account = strategy.account;
    return {
      mode: 'PAPER', strategy: strategy.code, status: strategy.status,
      circuitState: strategy.circuitBreaker?.status ?? 'RUNNING',
      allocatedCapital: account.allocatedCapital.toString(), activeCapital: account.activeCapital.toString(),
      cashBalance: account.cashBalance.toString(), reserveBalance: account.reserveBalance.toString(),
      nav: account.nav.toString(), realizedPnl: account.realizedPnl.toString(), unrealizedPnl: account.unrealizedPnl.toString(),
      dailyPnl: account.dailyPnl.toString(), dailyPnlRatio: account.dailyPnlRatio.toString(),
      weeklyPnl: account.weeklyPnl.toString(), weeklyPnlRatio: account.weeklyPnlRatio.toString(), drawdown: account.drawdown.toString(),
      exposure: Decimal.max(0, account.nav.minus(account.cashBalance).minus(account.reserveBalance)).toString(),
      positions: account.positions.map((position) => ({
        symbol: position.symbol, quantity: position.quantity.toString(), averageEntry: position.averageEntry.toString(),
        markPrice: position.markPrice.toString(), marketValue: position.marketValue.toString(),
        realizedPnl: position.realizedPnl.toString(), unrealizedPnl: position.unrealizedPnl.toString(), status: position.status,
        stopLoss: position.stopLoss?.toString() ?? null, takeProfit: position.takeProfit?.toString() ?? null,
        trailingStop: position.trailingStop?.toString() ?? null, markedAt: position.markedAt?.toISOString() ?? null,
      })),
      recentTrades: trades.map((fill) => ({
        id: fill.id, symbol: fill.order.symbol, side: fill.order.side, quantity: fill.quantity.toString(),
        price: fill.fillPrice.toString(), fee: fill.fee.toString(), executedAt: fill.executedAt.toISOString(), mode: 'PAPER',
      })),
      navHistory: account.navSnapshots.map((item) => ({ label: item.capturedAt.toISOString(), value: item.nav.toString() })).reverse(),
      lastCycle: strategy.cycles[0] ? { id: strategy.cycles[0].cycleId, status: strategy.cycles[0].status, startedAt: strategy.cycles[0].startedAt.toISOString(), error: strategy.cycles[0].error } : null,
      futures: { status: 'NOT_ACTIVE_YET' },
    };
  }

  async activities() {
    const rows = await this.prisma.db.strategyActivity.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    return rows.map((row) => ({ time: row.createdAt.toISOString(), agent: row.agentName, message: row.message, status: row.status, type: row.type, mode: 'PAPER' }));
  }

  async runCycle(cycleId = `${STRATEGY_CODE}:${String(Math.floor(Date.now() / 60_000))}`): Promise<{ status: string; cycleId: string }> {
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
      const marketHealthy = await this.markOpenPositions(strategy.id);
      if (!marketHealthy) {
        await this.persistCircuit(strategy.id, 'PAUSED', 'DATA_FEED_STALE');
        await this.markAccount(strategy.id);
        await this.completeCycle(strategy.id, cycleId);
        return { status: 'COMPLETED', cycleId };
      }
      const marked = await this.markAccount(strategy.id);
      await this.refreshCircuit(strategy.id, marked);
      for (const symbol of SYMBOLS) await this.evaluateSymbol(strategy.id, cycleId, symbol);
      const finalMark = await this.markAccount(strategy.id);
      await this.refreshCircuit(strategy.id, finalMark);
      await this.completeCycle(strategy.id, cycleId);
      return { status: 'COMPLETED', cycleId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown cycle failure';
      await this.prisma.db.strategyCycle.update({ where: { strategyId_cycleId: { strategyId: strategy.id, cycleId } }, data: { status: 'FAILED', finishedAt: new Date(), error: message.slice(0, 1024) } });
      await this.prisma.db.riskEvent.create({ data: { strategyId: strategy.id, severity: 'CRITICAL', code: 'SPOT_CYCLE_FAILED', message: message.slice(0, 512), details: { cycleId } } });
      throw error;
    }
  }

  async setState(state: 'PAPER' | 'PAUSED' | 'RISK_OFF', actorId: string): Promise<void> {
    const strategy = await this.ensureStrategy();
    const before = strategy.status;
    await this.prisma.db.$transaction([
      this.prisma.db.strategy.update({ where: { id: strategy.id }, data: { status: state } }),
      this.prisma.db.circuitBreakerState.upsert({ where: { strategyId: strategy.id }, create: { strategyId: strategy.id, status: state === 'PAPER' ? 'RUNNING' : state, reason: `ADMIN_${state}`, triggeredAt: state === 'PAPER' ? null : new Date() }, update: { status: state === 'PAPER' ? 'RUNNING' : state, reason: `ADMIN_${state}`, triggeredAt: state === 'PAPER' ? null : new Date() } }),
      this.prisma.db.auditLog.create({ data: { actorId, action: `SPOT_AGENT_${state}`, target: strategy.code, before: { status: before }, after: { status: state }, requestId: randomUUID() } }),
    ]);
  }

  private async ensureStrategy() {
    return this.prisma.db.strategy.upsert({
      where: { code: STRATEGY_CODE },
      create: { code: STRATEGY_CODE, name: 'Spot Swing V1', type: 'SPOT_SWING', status: 'DRAFT', riskProfile: { longOnly: true, paperOnly: true }, account: { create: {} }, circuitBreaker: { create: {} } },
      update: {},
    });
  }

  private async syncCapital(strategyId: string): Promise<void> {
    const [entries, config] = await Promise.all([
      this.prisma.db.ledgerEntry.findMany({ where: { account: { code: 'spot-treasury:USDC' } } }),
      this.configs.current(),
    ]);
    const capital = entries.reduce((sum, row) => row.side === 'DEBIT' ? sum.plus(row.amount.toString()) : sum.minus(row.amount.toString()), new Decimal(0));
    const account = await this.prisma.db.strategyAccount.findUniqueOrThrow({ where: { strategyId } });
    const reserveRatio = new Decimal(config.values.spotLiquidityReserve);
    const balanced = rebalancePaperCapital({
      allocatedCapital: account.allocatedCapital.toString(), activeCapital: account.activeCapital.toString(),
      cashBalance: account.cashBalance.toString(), reserveBalance: account.reserveBalance.toString(),
    }, capital, reserveRatio);
    const capitalDelta = capital.minus(account.allocatedCapital.toString());
    await this.prisma.db.strategyAccount.update({ where: { strategyId }, data: {
      ...balanced,
      nav: Decimal.max(0, new Decimal(account.nav.toString()).plus(capitalDelta)).toString(),
      highWaterMark: Decimal.max(0, new Decimal(account.highWaterMark.toString()).plus(Decimal.max(0, capitalDelta))).toString(),
      dailyOpeningNav: account.dailyBaselineAt ? Decimal.max(0, new Decimal(account.dailyOpeningNav.toString()).plus(capitalDelta)).toString() : account.dailyOpeningNav.toString(),
      weeklyOpeningNav: account.weeklyBaselineAt ? Decimal.max(0, new Decimal(account.weeklyOpeningNav.toString()).plus(capitalDelta)).toString() : account.weeklyOpeningNav.toString(),
    } });
  }

  private async evaluateSymbol(strategyId: string, cycleId: string, symbol: SpotSymbol): Promise<void> {
    const [candles, stats, position, account, config, circuit] = await Promise.all([
      this.market.getOHLCV(symbol, '1h', 100), this.market.get24hStats(symbol),
      this.prisma.db.position.findFirst({ where: { account: { strategyId }, symbol } }),
      this.prisma.db.strategyAccount.findUniqueOrThrow({ where: { strategyId }, include: { positions: { where: { status: 'OPEN' } } } }),
      this.configs.current(),
      this.prisma.db.circuitBreakerState.findUnique({ where: { strategyId } }),
    ]);
    const signal = evaluateSpotSwingV1(candles, undefined, position?.quantity.toString() ?? '0', position?.stopLoss?.toString());
    const signalRow = await this.prisma.db.tradeSignal.create({ data: { strategyId, cycleId, symbol, type: signal.signalType, strength: signal.strength, price: signal.price, indicators: signal.indicators, rationale: { reason: signal.reason, stopLoss: signal.stopLoss, takeProfit: signal.takeProfit } } });
    await this.activity(strategyId, 'SIGNAL', 'Spot Agent', `${symbol} ${signal.signalType}: ${signal.reason}`, 'PAPER SIGNAL');
    if (signal.signalType === 'HOLD') return;
    const requested = signal.signalType === 'BUY' ? Decimal.min(config.values.spotMaxOrderNotional, account.activeCapital.mul('0.10')).toFixed() : position?.marketValue.toString() ?? '0';
    const proposal = await this.prisma.db.tradeProposal.create({ data: { strategyId, signalId: signalRow.id, cycleId, symbol, side: signal.signalType === 'BUY' ? 'BUY' : signal.signalType, requestedNotional: requested, referencePrice: signal.price } });
    const exposure = account.positions.reduce((sum, item) => sum.plus(item.marketValue.toString()), new Decimal(0));
    const riskSide = signal.signalType === 'BUY' ? 'BUY' : signal.signalType === 'REDUCE' ? 'REDUCE' : 'EXIT';
    const decision = evaluateSpotRisk({ symbol, side: riskSide, targetNotional: requested, currentExposure: exposure.toFixed(), expectedPrice: signal.price, maxSlippage: new Decimal(config.values.spotMaxSlippageBps).div(10_000).toFixed(), marketDataTimestamp: signal.marketDataTimestamp }, {
      equity: account.nav.toString(), cashBalance: account.cashBalance.toString(), reserveAmount: '0', currentTotalExposure: exposure.toFixed(), assetExposure: position?.marketValue.toString() ?? '0', dailyPnlRatio: account.dailyPnlRatio.toString(), weeklyPnlRatio: account.weeklyPnlRatio.toString(), drawdown: account.drawdown.toString(), volatility: signal.indicators.volatility ?? '0', marketLiquidity: stats.quoteVolume, estimatedSlippage: new Decimal(config.values.spotBaseSlippageBps).div(10_000).toFixed(), now: Date.now(), circuitState: circuit?.status ?? 'RUNNING',
    }, { allowedAssets: SYMBOLS, maxSingleAssetExposure: config.values.maxSpotAssetExposure, maxTotalSpotExposure: config.values.spotMaxTotalExposure, maxPositionSize: config.values.maxSpotAssetExposure, maxTradeSize: config.values.maxSpotStrategyAllocation, maxOrderNotional: config.values.spotMaxOrderNotional, maxDailyLoss: config.values.spotRiskReducedDailyLoss, pauseDailyLoss: config.values.spotPauseDailyLoss, maxWeeklyLoss: config.values.maxWeeklyLoss, maxDrawdown: config.values.maxDrawdown, maxSlippage: new Decimal(config.values.spotMaxSlippageBps).div(10_000).toFixed(), minLiquidity: config.values.spotMinLiquidityUsd, maxVolatility: config.values.spotMaxVolatility, stalePriceSeconds: config.values.spotDataStaleSeconds, liquidityReserve: config.values.spotLiquidityReserve });
    const risk = await this.prisma.db.riskDecision.create({ data: { proposalId: proposal.id, decision: decision.decision, requestedNotional: requested, approvedNotional: decision.approvedNotional, reasonCodes: [...decision.reasonCodes], metrics: { ...decision.riskMetrics } } });
    await this.prisma.db.tradeProposal.update({ where: { id: proposal.id }, data: { approvedNotional: decision.approvedNotional, status: decision.decision === 'REJECTED' ? 'RISK_REJECTED' : decision.decision === 'REDUCED' ? 'RISK_REDUCED' : 'RISK_APPROVED' } });
    await this.activity(strategyId, 'RISK', 'Risk Engine', `${symbol} ${decision.decision}`, decision.reasonCodes.join(', ') || 'APPROVED');
    if (decision.circuitState !== (circuit?.status ?? 'RUNNING')) {
      const reason = decision.reasonCodes.includes('STALE_MARKET_DATA') ? 'DATA_FEED_STALE' : 'RISK_ENGINE';
      await this.persistCircuit(strategyId, decision.circuitState, reason);
    }
    if (decision.decision === 'REJECTED') return;
    await this.execute(strategyId, account.id, proposal.id, risk.id, cycleId, symbol, signal.signalType, signal.price, requested, decision, position, signal.stopLoss, signal.takeProfit);
  }

  private async execute(strategyId: string, accountId: string, proposalId: string, riskDecisionId: string, cycleId: string, symbol: SpotSymbol, proposalSide: 'BUY' | 'REDUCE' | 'EXIT' | 'HOLD', price: string, requested: string, decision: ReturnType<typeof evaluateSpotRisk>, position: Awaited<ReturnType<typeof this.prisma.db.position.findFirst>>, stopLoss: string | null, takeProfit: string | null): Promise<void> {
    const side = proposalSide === 'BUY' ? 'BUY' : 'SELL';
    const order = await this.prisma.db.paperOrder.create({ data: { proposalId, riskDecisionId, cycleId, symbol, side, status: 'RISK_APPROVED', quantity: side === 'BUY' ? new Decimal(decision.approvedNotional).div(price).toFixed() : position?.quantity.toString() ?? '0', notional: decision.approvedNotional, referencePrice: price } });
    const config = (await this.configs.current()).values;
    const fill = await new PaperSpotExchangeAdapter({ tradingFeeBps: config.spotTradingFeeBps, baseSlippageBps: config.spotBaseSlippageBps, liquidityImpactBps: '10', maxSlippageBps: config.spotMaxSlippageBps }).execute({ orderId: order.id, symbol, side, notional: decision.approvedNotional, ...(side === 'SELL' && position ? { quantity: position.quantity.toString() } : {}) }, decision, { price, liquidity: config.spotMinLiquidityUsd, timestamp: Date.now() });
    const account = await this.prisma.db.strategyAccount.findUniqueOrThrow({ where: { id: accountId } });
    const accounting = applyPaperFill({ cashBalance: account.cashBalance.toString(), realizedPnl: account.realizedPnl.toString(), highWaterMark: account.highWaterMark.toString() }, { symbol, quantity: position?.quantity.toString() ?? '0', averageEntryPrice: position?.averageEntry.toString() ?? '0', realizedPnl: position?.realizedPnl.toString() ?? '0' }, fill);
    const remaining = new Decimal(accounting.position.quantity);
    const positionWrite = this.prisma.db.position.upsert({
      where: { strategyAccountId_symbol: { strategyAccountId: accountId, symbol } },
      create: {
        strategyAccountId: accountId, symbol, quantity: accounting.position.quantity,
        averageEntry: accounting.position.averageEntryPrice, markPrice: fill.price,
        marketValue: remaining.mul(fill.price).toString(), realizedPnl: accounting.position.realizedPnl,
        unrealizedPnl: remaining.mul(new Decimal(fill.price).minus(accounting.position.averageEntryPrice)).toString(),
        stopLoss, takeProfit, markedAt: new Date(fill.timestamp),
        ...(side === 'BUY' ? { lots: { create: { quantity: fill.quantity, entryPrice: fill.price, fee: fill.fee } } } : {}),
      },
      update: {
        quantity: accounting.position.quantity, averageEntry: accounting.position.averageEntryPrice,
        markPrice: fill.price, marketValue: remaining.mul(fill.price).toString(),
        realizedPnl: accounting.position.realizedPnl,
        unrealizedPnl: remaining.mul(new Decimal(fill.price).minus(accounting.position.averageEntryPrice)).toString(),
        status: remaining.isZero() ? 'CLOSED' : 'OPEN', closedAt: remaining.isZero() ? new Date() : null,
        markedAt: new Date(fill.timestamp),
        ...(side === 'BUY' ? { stopLoss, takeProfit, lots: { create: { quantity: fill.quantity, entryPrice: fill.price, fee: fill.fee } } } : {}),
        ...(remaining.isZero() ? { stopLoss: null, takeProfit: null, trailingStop: null, lots: { updateMany: { where: { closedAt: null }, data: { closedAt: new Date() } } } } : {}),
      },
    });
    const slippageCost = new Decimal(fill.price).minus(fill.sourcePrice).abs().mul(fill.quantity);
    const fees = new Decimal(account.fees).plus(fill.fee);
    const cumulativeSlippage = new Decimal(account.slippageCost).plus(slippageCost);
    const netRealized = new Decimal(accounting.account.realizedPnl);
    await this.prisma.db.$transaction([
      this.prisma.db.paperOrder.update({ where: { id: order.id }, data: { status: 'FILLED', quantity: fill.quantity, notional: fill.notional } }),
      this.prisma.db.paperExecution.create({ data: { orderId: order.id, fillPrice: fill.price, sourcePrice: fill.sourcePrice, quantity: fill.quantity, grossNotional: fill.notional, fee: fill.fee, slippageBps: new Decimal(fill.slippage).mul(10_000).toString(), slippageCost: slippageCost.toString(), executedAt: new Date(fill.timestamp) } }),
      positionWrite,
      this.prisma.db.strategyAccount.update({ where: { id: accountId }, data: { cashBalance: accounting.account.cashBalance, realizedPnl: netRealized.toString(), netRealizedPnl: netRealized.toString(), fees: fees.toString(), slippageCost: cumulativeSlippage.toString(), grossRealizedPnl: netRealized.plus(fees).plus(cumulativeSlippage).toString() } }),
      this.prisma.db.tradeProposal.update({ where: { id: proposalId }, data: { status: 'EXECUTED' } }),
    ]);
    await this.activity(strategyId, 'EXECUTION', 'Spot Agent', `${side} ${fill.quantity} ${symbol} @ ${fill.price}`, 'PAPER FILLED');
  }

  private async markOpenPositions(strategyId: string): Promise<boolean> {
    const [account, config] = await Promise.all([
      this.prisma.db.strategyAccount.findUniqueOrThrow({ where: { strategyId }, include: { positions: { where: { status: 'OPEN' } } } }),
      this.configs.current(),
    ]);
    const ticks = await Promise.all(account.positions.map(async (position) => ({ position, ticker: await this.market.getTicker(position.symbol as SpotSymbol) })));
    const now = Date.now();
    if (ticks.some(({ ticker }) => now - ticker.exchangeTimestamp > config.values.spotDataStaleSeconds * 1_000)) return false;
    await this.prisma.db.$transaction(ticks.map(({ position, ticker }) => {
      const quantity = new Decimal(position.quantity.toString());
      const price = new Decimal(ticker.price);
      return this.prisma.db.position.update({ where: { id: position.id }, data: {
        markPrice: price.toString(), marketValue: quantity.mul(price).toString(),
        unrealizedPnl: quantity.mul(price.minus(position.averageEntry.toString())).toString(), markedAt: new Date(now),
      } });
    }));
    return true;
  }

  private async markAccount(strategyId: string) {
    const account = await this.prisma.db.strategyAccount.findUniqueOrThrow({ where: { strategyId }, include: { positions: { where: { status: 'OPEN' } } } });
    const marked = markPaperNav({ cashBalance: account.cashBalance.toString(), reserveBalance: account.reserveBalance.toString(), realizedPnl: account.realizedPnl.toString(), highWaterMark: account.highWaterMark.toString() }, account.positions.map((position) => ({ symbol: position.symbol, quantity: position.quantity.toString(), averageEntryPrice: position.averageEntry.toString(), realizedPnl: position.realizedPnl.toString(), currentPrice: position.markPrice.toString() })));
    const nav = new Decimal(marked.equity);
    const now = new Date();
    const daily = calculatePeriodPnl(nav, { openingNav: account.dailyOpeningNav.toString(), baselineAt: account.dailyBaselineAt }, utcDayStart(now));
    const weekly = calculatePeriodPnl(nav, { openingNav: account.weeklyOpeningNav.toString(), baselineAt: account.weeklyBaselineAt }, utcWeekStart(now));
    const highWaterMark = Decimal.max(account.highWaterMark.toString(), nav);
    const drawdown = highWaterMark.isZero() ? new Decimal(0) : nav.minus(highWaterMark).div(highWaterMark);
    await this.prisma.db.$transaction([
      this.prisma.db.strategyAccount.update({ where: { id: account.id }, data: {
        nav: nav.toString(), highWaterMark: highWaterMark.toString(), unrealizedPnl: marked.unrealizedPnl, drawdown: drawdown.toString(),
        dailyOpeningNav: daily.openingNav, dailyBaselineAt: daily.baselineAt, dailyPnl: daily.pnl, dailyPnlRatio: daily.pnlRatio,
        weeklyOpeningNav: weekly.openingNav, weeklyBaselineAt: weekly.baselineAt, weeklyPnl: weekly.pnl, weeklyPnlRatio: weekly.pnlRatio,
      } }),
      this.prisma.db.navSnapshot.create({ data: { strategyAccountId: account.id, nav: nav.toString(), cash: account.cashBalance.toString(), reserve: account.reserveBalance.toString(), exposure: marked.marketValue, realizedPnl: account.realizedPnl.toString(), unrealizedPnl: marked.unrealizedPnl, drawdown: drawdown.toString() } }),
    ]);
    return { nav: nav.toString(), dailyPnlRatio: daily.pnlRatio, weeklyPnlRatio: weekly.pnlRatio, drawdown: drawdown.toString() };
  }

  private async refreshCircuit(strategyId: string, metrics: { readonly dailyPnlRatio: string; readonly weeklyPnlRatio: string; readonly drawdown: string }): Promise<void> {
    const [config, persisted] = await Promise.all([
      this.configs.current(),
      this.prisma.db.circuitBreakerState.findUnique({ where: { strategyId } }),
    ]);
    const derived = deriveCircuitState(metrics.dailyPnlRatio, metrics.drawdown, {
      maxDailyLoss: config.values.spotRiskReducedDailyLoss,
      pauseDailyLoss: config.values.spotPauseDailyLoss,
      maxDrawdown: config.values.maxDrawdown,
    }, true, metrics.weeklyPnlRatio, config.values.maxWeeklyLoss);
    const next = resolveCircuitTransition(persisted?.status ?? 'RUNNING', persisted?.reason ?? null, derived);
    if (next !== (persisted?.status ?? 'RUNNING')) await this.persistCircuit(strategyId, next, `AUTO_${next}`);
  }

  private async persistCircuit(strategyId: string, state: CircuitState, reason: string): Promise<void> {
    const current = await this.prisma.db.circuitBreakerState.findUnique({ where: { strategyId } });
    if (current?.status === state && current.reason === reason) return;
    const severity = state === 'RISK_OFF' || state === 'PAUSED' ? 'CRITICAL' : state === 'REDUCED_RISK' ? 'WARNING' : 'INFO';
    await this.prisma.db.$transaction([
      this.prisma.db.circuitBreakerState.upsert({ where: { strategyId }, create: { strategyId, status: state, reason, triggeredAt: state === 'RUNNING' ? null : new Date() }, update: { status: state, reason, triggeredAt: state === 'RUNNING' ? null : new Date() } }),
      this.prisma.db.riskEvent.create({ data: { strategyId, severity, code: `CIRCUIT_${state}`, message: `Spot circuit changed from ${current?.status ?? 'RUNNING'} to ${state}`, details: { before: current?.status ?? 'RUNNING', after: state, reason } } }),
      this.prisma.db.strategyActivity.create({ data: { strategyId, type: 'SYSTEM', agentName: 'Risk Engine', message: `Circuit ${current?.status ?? 'RUNNING'} → ${state}`, status: reason, metadata: { mode: 'PAPER', reason } } }),
      this.prisma.db.auditLog.create({ data: { actorId: null, action: 'SPOT_CIRCUIT_TRANSITION', target: STRATEGY_CODE, before: { status: current?.status ?? 'RUNNING', reason: current?.reason ?? null }, after: { status: state, reason }, requestId: randomUUID() } }),
    ]);
  }

  private completeCycle(strategyId: string, cycleId: string) {
    return this.prisma.db.strategyCycle.update({ where: { strategyId_cycleId: { strategyId, cycleId } }, data: { status: 'COMPLETED', finishedAt: new Date() } });
  }

  private activity(strategyId: string, type: 'SIGNAL' | 'RISK' | 'EXECUTION', agentName: string, message: string, status: string) {
    return this.prisma.db.strategyActivity.create({ data: { strategyId, type, agentName, message, status, metadata: { mode: 'PAPER' } } });
  }

  private emptySnapshot() { return { mode: 'PAPER', strategy: STRATEGY_CODE, status: 'DRAFT', circuitState: 'RUNNING', allocatedCapital: '0', activeCapital: '0', cashBalance: '0', reserveBalance: '0', nav: '0', realizedPnl: '0', unrealizedPnl: '0', dailyPnl: '0', dailyPnlRatio: '0', weeklyPnl: '0', weeklyPnlRatio: '0', drawdown: '0', exposure: '0', positions: [], recentTrades: [], navHistory: [], lastCycle: null, futures: { status: 'NOT_ACTIVE_YET' } }; }
}
