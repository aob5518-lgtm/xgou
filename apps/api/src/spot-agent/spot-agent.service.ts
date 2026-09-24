import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { MockMarketDataAdapter, PublicMarketDataAdapter, type MarketDataAdapter, type SpotSymbol } from '@xgou/market-data';
import { evaluateSpotSwingV1 } from '@xgou/strategy-engine';
import { evaluateSpotRisk } from '@xgou/risk-engine';
import { applyPaperFill, markPaperNav, PaperSpotExchangeAdapter } from '@xgou/exchange-adapters';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { SystemConfigService } from '../config/system-config.service.js';

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
      dailyPnl: account.dailyPnl.toString(), drawdown: account.drawdown.toString(),
      exposure: Decimal.max(0, account.nav.minus(account.cashBalance).minus(account.reserveBalance)).toString(),
      positions: account.positions.map((position) => ({
        symbol: position.symbol, quantity: position.quantity.toString(), averageEntry: position.averageEntry.toString(),
        markPrice: position.markPrice.toString(), marketValue: position.marketValue.toString(),
        realizedPnl: position.realizedPnl.toString(), unrealizedPnl: position.unrealizedPnl.toString(), status: position.status,
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
    if (strategy.status !== 'PAPER') return { status: 'SKIPPED', cycleId };
    const existing = await this.prisma.db.strategyCycle.findUnique({ where: { strategyId_cycleId: { strategyId: strategy.id, cycleId } } });
    if (existing) return { status: 'IDEMPOTENT', cycleId };
    await this.prisma.db.strategyCycle.create({ data: { strategyId: strategy.id, cycleId } });
    try {
      await this.syncCapital(strategy.id);
      for (const symbol of SYMBOLS) await this.evaluateSymbol(strategy.id, cycleId, symbol);
      await this.markAccount(strategy.id);
      await this.prisma.db.strategyCycle.update({ where: { strategyId_cycleId: { strategyId: strategy.id, cycleId } }, data: { status: 'COMPLETED', finishedAt: new Date() } });
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
    const delta = Decimal.max(0, capital.minus(account.allocatedCapital));
    const reserveRatio = new Decimal(config.values.spotLiquidityReserve);
    const reserve = capital.mul(reserveRatio);
    await this.prisma.db.strategyAccount.update({ where: { strategyId }, data: {
      allocatedCapital: capital.toString(), activeCapital: capital.mul('0.80').toString(), reserveBalance: reserve.toString(),
      cashBalance: new Decimal(account.cashBalance.toString()).plus(delta).minus(delta.mul(reserveRatio)).toString(),
      nav: Decimal.max(capital, account.nav.toString()).toString(), highWaterMark: Decimal.max(capital, account.highWaterMark.toString()).toString(),
    } });
  }

  private async evaluateSymbol(strategyId: string, cycleId: string, symbol: SpotSymbol): Promise<void> {
    const [candles, stats, position, account, config] = await Promise.all([
      this.market.getOHLCV(symbol, '1h', 100), this.market.get24hStats(symbol),
      this.prisma.db.position.findFirst({ where: { account: { strategyId }, symbol } }),
      this.prisma.db.strategyAccount.findUniqueOrThrow({ where: { strategyId }, include: { positions: { where: { status: 'OPEN' } } } }),
      this.configs.current(),
    ]);
    const signal = evaluateSpotSwingV1(candles, undefined, position?.quantity.toString() ?? '0');
    const signalRow = await this.prisma.db.tradeSignal.create({ data: { strategyId, cycleId, symbol, type: signal.signalType, strength: signal.strength, price: signal.price, indicators: signal.indicators, rationale: { reason: signal.reason, stopLoss: signal.stopLoss, takeProfit: signal.takeProfit } } });
    await this.activity(strategyId, 'SIGNAL', 'Spot Agent', `${symbol} ${signal.signalType}: ${signal.reason}`, 'PAPER SIGNAL');
    if (signal.signalType === 'HOLD') return;
    const requested = signal.signalType === 'BUY' ? Decimal.min(config.values.spotMaxOrderNotional, account.activeCapital.mul('0.10')).toFixed() : position?.marketValue.toString() ?? '0';
    const proposal = await this.prisma.db.tradeProposal.create({ data: { strategyId, signalId: signalRow.id, cycleId, symbol, side: signal.signalType === 'BUY' ? 'BUY' : signal.signalType, requestedNotional: requested, referencePrice: signal.price } });
    const exposure = account.positions.reduce((sum, item) => sum.plus(item.marketValue.toString()), new Decimal(0));
    const decision = evaluateSpotRisk({ symbol, side: proposal.side, targetNotional: requested, currentExposure: exposure.toFixed(), expectedPrice: signal.price, maxSlippage: new Decimal(config.values.spotMaxSlippageBps).div(10_000).toFixed(), marketDataTimestamp: signal.marketDataTimestamp }, {
      equity: account.nav.toString(), cashBalance: account.cashBalance.toString(), reserveAmount: '0', currentTotalExposure: exposure.toFixed(), assetExposure: position?.marketValue.toString() ?? '0', dailyPnlRatio: account.nav.isZero() ? '0' : account.dailyPnl.div(account.nav).toString(), weeklyPnlRatio: '0', drawdown: account.drawdown.toString(), volatility: signal.indicators.volatility ?? '0', marketLiquidity: stats.quoteVolume, estimatedSlippage: new Decimal(config.values.spotBaseSlippageBps).div(10_000).toFixed(), now: Date.now(), circuitState: 'RUNNING',
    }, { allowedAssets: SYMBOLS, maxSingleAssetExposure: config.values.maxSpotAssetExposure, maxTotalSpotExposure: config.values.spotMaxTotalExposure, maxPositionSize: config.values.maxSpotAssetExposure, maxTradeSize: config.values.maxSpotStrategyAllocation, maxOrderNotional: config.values.spotMaxOrderNotional, maxDailyLoss: config.values.spotRiskReducedDailyLoss, pauseDailyLoss: config.values.spotPauseDailyLoss, maxWeeklyLoss: config.values.maxWeeklyLoss, maxDrawdown: config.values.maxDrawdown, maxSlippage: new Decimal(config.values.spotMaxSlippageBps).div(10_000).toFixed(), minLiquidity: config.values.spotMinLiquidityUsd, maxVolatility: config.values.spotMaxVolatility, stalePriceSeconds: config.values.spotDataStaleSeconds, liquidityReserve: config.values.spotLiquidityReserve });
    const risk = await this.prisma.db.riskDecision.create({ data: { proposalId: proposal.id, decision: decision.decision, requestedNotional: requested, approvedNotional: decision.approvedNotional, reasonCodes: [...decision.reasonCodes], metrics: { ...decision.riskMetrics } } });
    await this.prisma.db.tradeProposal.update({ where: { id: proposal.id }, data: { approvedNotional: decision.approvedNotional, status: decision.decision === 'REJECTED' ? 'RISK_REJECTED' : decision.decision === 'REDUCED' ? 'RISK_REDUCED' : 'RISK_APPROVED' } });
    await this.activity(strategyId, 'RISK', 'Risk Engine', `${symbol} ${decision.decision}`, decision.reasonCodes.join(', ') || 'APPROVED');
    if (decision.decision === 'REJECTED') return;
    await this.execute(strategyId, account.id, proposal.id, risk.id, cycleId, symbol, signal.price, requested, decision, position);
  }

  private async execute(strategyId: string, accountId: string, proposalId: string, riskDecisionId: string, cycleId: string, symbol: SpotSymbol, price: string, requested: string, decision: ReturnType<typeof evaluateSpotRisk>, position: Awaited<ReturnType<typeof this.prisma.db.position.findFirst>>): Promise<void> {
    const side = position && new Decimal(position.quantity.toString()).gt(0) && decision.approvedNotional !== '0' && new Decimal(requested).eq(position.marketValue.toString()) ? 'SELL' : 'BUY';
    const order = await this.prisma.db.paperOrder.create({ data: { proposalId, riskDecisionId, cycleId, symbol, side, status: 'RISK_APPROVED', quantity: side === 'BUY' ? new Decimal(decision.approvedNotional).div(price).toFixed() : position?.quantity.toString() ?? '0', notional: decision.approvedNotional, referencePrice: price } });
    const config = (await this.configs.current()).values;
    const fill = await new PaperSpotExchangeAdapter({ tradingFeeBps: config.spotTradingFeeBps, baseSlippageBps: config.spotBaseSlippageBps, liquidityImpactBps: '10', maxSlippageBps: config.spotMaxSlippageBps }).execute({ orderId: order.id, symbol, side, notional: decision.approvedNotional, ...(side === 'SELL' && position ? { quantity: position.quantity.toString() } : {}) }, decision, { price, liquidity: config.spotMinLiquidityUsd, timestamp: Date.now() });
    const account = await this.prisma.db.strategyAccount.findUniqueOrThrow({ where: { id: accountId } });
    const accounting = applyPaperFill({ cashBalance: account.cashBalance.toString(), realizedPnl: account.realizedPnl.toString(), highWaterMark: account.highWaterMark.toString() }, { symbol, quantity: position?.quantity.toString() ?? '0', averageEntryPrice: position?.averageEntry.toString() ?? '0', realizedPnl: position?.realizedPnl.toString() ?? '0' }, fill);
    await this.prisma.db.$transaction([
      this.prisma.db.paperOrder.update({ where: { id: order.id }, data: { status: 'FILLED', quantity: fill.quantity, notional: fill.notional } }),
      this.prisma.db.paperExecution.create({ data: { orderId: order.id, fillPrice: fill.price, quantity: fill.quantity, grossNotional: fill.notional, fee: fill.fee, slippageBps: new Decimal(fill.slippage).mul(10_000).toString(), executedAt: new Date(fill.timestamp) } }),
      this.prisma.db.position.upsert({ where: { strategyAccountId_symbol: { strategyAccountId: accountId, symbol } }, create: { strategyAccountId: accountId, symbol, quantity: accounting.position.quantity, averageEntry: accounting.position.averageEntryPrice, markPrice: fill.price, marketValue: new Decimal(accounting.position.quantity).mul(fill.price).toString(), realizedPnl: accounting.position.realizedPnl, lots: { create: { quantity: fill.quantity, entryPrice: fill.price, fee: fill.fee, closedAt: side === 'SELL' ? new Date() : null } } }, update: { quantity: accounting.position.quantity, averageEntry: accounting.position.averageEntryPrice, markPrice: fill.price, marketValue: new Decimal(accounting.position.quantity).mul(fill.price).toString(), realizedPnl: accounting.position.realizedPnl, status: new Decimal(accounting.position.quantity).isZero() ? 'CLOSED' : 'OPEN', closedAt: new Decimal(accounting.position.quantity).isZero() ? new Date() : null, lots: { create: { quantity: fill.quantity, entryPrice: fill.price, fee: fill.fee, closedAt: side === 'SELL' ? new Date() : null } } } }),
      this.prisma.db.strategyAccount.update({ where: { id: accountId }, data: { cashBalance: accounting.account.cashBalance, realizedPnl: accounting.account.realizedPnl } }),
      this.prisma.db.tradeProposal.update({ where: { id: proposalId }, data: { status: 'EXECUTED' } }),
    ]);
    await this.activity(strategyId, 'EXECUTION', 'Spot Agent', `${side} ${fill.quantity} ${symbol} @ ${fill.price}`, 'PAPER FILLED');
  }

  private async markAccount(strategyId: string): Promise<void> {
    const account = await this.prisma.db.strategyAccount.findUniqueOrThrow({ where: { strategyId }, include: { positions: { where: { status: 'OPEN' } } } });
    const marked = markPaperNav({ cashBalance: account.cashBalance.toString(), realizedPnl: account.realizedPnl.toString(), highWaterMark: account.highWaterMark.toString() }, account.positions.map((position) => ({ symbol: position.symbol, quantity: position.quantity.toString(), averageEntryPrice: position.averageEntry.toString(), realizedPnl: position.realizedPnl.toString(), currentPrice: position.markPrice.toString() })));
    const nav = new Decimal(marked.equity).plus(account.reserveBalance.toString());
    await this.prisma.db.$transaction([
      this.prisma.db.strategyAccount.update({ where: { id: account.id }, data: { nav: nav.toString(), highWaterMark: Decimal.max(account.highWaterMark.toString(), nav).toString(), unrealizedPnl: marked.unrealizedPnl, drawdown: marked.drawdown } }),
      this.prisma.db.navSnapshot.create({ data: { strategyAccountId: account.id, nav: nav.toString(), cash: account.cashBalance.toString(), reserve: account.reserveBalance.toString(), exposure: marked.marketValue, realizedPnl: account.realizedPnl.toString(), unrealizedPnl: marked.unrealizedPnl, drawdown: marked.drawdown } }),
    ]);
  }

  private activity(strategyId: string, type: 'SIGNAL' | 'RISK' | 'EXECUTION', agentName: string, message: string, status: string) {
    return this.prisma.db.strategyActivity.create({ data: { strategyId, type, agentName, message, status, metadata: { mode: 'PAPER' } } });
  }

  private emptySnapshot() { return { mode: 'PAPER', strategy: STRATEGY_CODE, status: 'DRAFT', circuitState: 'RUNNING', allocatedCapital: '0', activeCapital: '0', cashBalance: '0', reserveBalance: '0', nav: '0', realizedPnl: '0', unrealizedPnl: '0', dailyPnl: '0', drawdown: '0', exposure: '0', positions: [], recentTrades: [], navHistory: [], lastCycle: null, futures: { status: 'NOT_ACTIVE_YET' } }; }
}
