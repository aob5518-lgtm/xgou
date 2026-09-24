import { describe, expect, it } from 'vitest';
import { applyPaperFill, LiveExchangeAdapter, markPaperNav, PaperSpotExchangeAdapter } from './index.js';
import type { RiskEvaluation } from '@xgou/risk-engine';
import { evaluateSpotRisk } from '@xgou/risk-engine';
import { createHistoricalFixture, type Candle } from '@xgou/market-data';
import { evaluateSpotSwingV1 } from '@xgou/strategy-engine';
import { Decimal } from 'decimal.js';

const approved: RiskEvaluation = { decision: 'APPROVED', approvedNotional: '300', reasonCodes: [], riskMetrics: {}, circuitState: 'RUNNING' };
const adapter = new PaperSpotExchangeAdapter({ tradingFeeBps: '10', baseSlippageBps: '5', liquidityImpactBps: '100', maxSlippageBps: '50' });

describe('paper spot execution and accounting', () => {
  it('rejects execution without an approved risk decision', async () => {
    await expect(adapter.execute({ orderId: '1', symbol: 'BTC/USDC', side: 'BUY', notional: '300' }, { ...approved, decision: 'REJECTED', approvedNotional: '0' }, { price: '60000', liquidity: '10000000', timestamp: 1 })).rejects.toThrow('approved risk decision');
  });

  it('executes a fee/slippage-aware BUY and conserves NAV', async () => {
    const fill = await adapter.execute({ orderId: '1', symbol: 'BTC/USDC', side: 'BUY', notional: '300' }, approved, { price: '60000', liquidity: '10000000', timestamp: 1 });
    expect(fill.fee).toBe('0.3');
    expect(fill.slippage).not.toBe('0');
    const result = applyPaperFill(
      { cashBalance: '2400', realizedPnl: '0', highWaterMark: '2400' },
      { symbol: 'BTC/USDC', quantity: '0', averageEntryPrice: '0', realizedPnl: '0' },
      fill,
    );
    expect(result.account.cashBalance).toBe('2100');
    const nav = markPaperNav(result.account, [{ ...result.position, currentPrice: fill.price }]);
    expect(nav.equity).toBe('2399.7');
  });

  it('supports partial reduction, realized PnL and remaining unrealized PnL', () => {
    const result = applyPaperFill(
      { cashBalance: '2100', realizedPnl: '0', highWaterMark: '2400' },
      { symbol: 'BTC/USDC', quantity: '0.005', averageEntryPrice: '60000', realizedPnl: '0' },
      { orderId: '2', symbol: 'BTC/USDC', side: 'SELL', quantity: '0.0025', price: '66000', notional: '165', fee: '0.165', slippage: '0.0005', timestamp: 2, sourcePrice: '66033' },
    );
    expect(result.position.quantity).toBe('0.0025');
    expect(result.realizedPnlDelta).toBe('14.835');
    expect(markPaperNav(result.account, [{ ...result.position, currentPrice: '66000' }]).unrealizedPnl).toBe('15');
  });

  it('refuses to instantiate any live adapter while the gate is false', () => {
    process.env.REAL_TRADING_ENABLED = 'false';
    expect(() => new LiveExchangeAdapter()).toThrow('disabled');
  });

  it('runs fixture market data through signal, risk, paper fill and NAV', async () => {
    const rows = createHistoricalFixture('BTC/USDC', '60000', 100);
    const candles: readonly Candle[] = [...rows.slice(0, -1), { ...rows.at(-1), volume: new Decimal(rows.at(-1)?.volume ?? 0).mul(3).toFixed() } as Candle];
    const signal = evaluateSpotSwingV1(candles, {
      emaFastPeriod: 20, emaSlowPeriod: 50, rsiPeriod: 14, rsiEntryMin: '0', rsiEntryMax: '100',
      atrPeriod: 14, volumePeriod: 20, momentumPeriod: 20, maxPullbackDeviation: '1', maxAtrRatio: '1',
      stopAtrMultiple: '2', targetAtrMultiple: '4',
    });
    expect(signal.signalType).toBe('BUY');
    const decision = evaluateSpotRisk({ symbol: signal.symbol, side: 'BUY', targetNotional: '300', currentExposure: '0', expectedPrice: signal.price, maxSlippage: '0.005', marketDataTimestamp: signal.marketDataTimestamp }, {
      equity: '3000', cashBalance: '2400', reserveAmount: '0', currentTotalExposure: '0', assetExposure: '0', dailyPnlRatio: '0', weeklyPnlRatio: '0', drawdown: '0', volatility: signal.indicators.volatility ?? '0', marketLiquidity: '10000000', estimatedSlippage: '0.0005', now: signal.marketDataTimestamp, circuitState: 'RUNNING',
    }, {
      allowedAssets: ['BTC/USDC', 'ETH/USDC', 'SOL/USDC'], maxSingleAssetExposure: '0.20', maxTotalSpotExposure: '0.80', maxPositionSize: '0.20', maxTradeSize: '0.25', maxOrderNotional: '25000', maxDailyLoss: '0.01', pauseDailyLoss: '0.02', maxWeeklyLoss: '0.05', maxDrawdown: '0.15', maxSlippage: '0.005', minLiquidity: '1000000', maxVolatility: '0.12', stalePriceSeconds: 120, liquidityReserve: '0.20',
    });
    expect(decision.decision).toBe('APPROVED');
    const fill = await adapter.execute({ orderId: 'pipeline', symbol: signal.symbol, side: 'BUY', notional: '300' }, decision, { price: signal.price, liquidity: '10000000', timestamp: signal.marketDataTimestamp });
    const accounting = applyPaperFill({ cashBalance: '2400', realizedPnl: '0', highWaterMark: '3000' }, { symbol: signal.symbol, quantity: '0', averageEntryPrice: '0', realizedPnl: '0' }, fill);
    expect(new Decimal(markPaperNav(accounting.account, [{ ...accounting.position, currentPrice: fill.price }]).equity).gt(0)).toBe(true);
  });
});
