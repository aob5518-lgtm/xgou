import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { createHistoricalFixture, type Candle } from '@xgou/market-data';
import { atr, ema, evaluateFuturesTrendV1, evaluateSpotSwingV1, rsi, sma, updateTrailingStop } from './index.js';

const withLast = (rows: readonly Candle[], changes: Partial<Candle>): readonly Candle[] => [
  ...rows.slice(0, -1), { ...rows.at(-1), ...changes } as Candle,
];

describe('indicators', () => {
  const values = Array.from({ length: 60 }, (_, index) => new Decimal(100).plus(index % 5).plus(new Decimal(index).div(10)).toFixed());
  it('computes SMA, EMA, RSI and ATR using Decimal', () => {
    const candles = createHistoricalFixture('BTC/USDC', '60000', 100);
    expect(sma(values, 20).gt(0)).toBe(true);
    expect(ema(values, 20).gt(0)).toBe(true);
    expect(rsi(values, 14).gte(0)).toBe(true);
    expect(atr(candles, 14).gt(0)).toBe(true);
  });
});

describe('FUTURES_TREND_V1', () => {
  const bullish = createHistoricalFixture('BTC/USDC', '100', 130);
  const bearish: readonly Candle[] = Array.from({ length: 130 }, (_, index) => {
    const price = new Decimal(250).minus(index).toFixed();
    return { ...(bullish[index] as Candle), open: new Decimal(price).plus('0.5').toFixed(), high: new Decimal(price).plus(1).toFixed(), low: new Decimal(price).minus(1).toFixed(), close: price };
  });
  const config = { emaFastPeriod: 20, emaMediumPeriod: 50, emaSlowPeriod: 100, atrPeriod: 14, rsiPeriod: 14, momentumPeriod: 20, minTrendStrength: '0.0001', maxAtrRatio: '1', longRsiMax: '101', shortRsiMin: '-1', maxFundingRateAbs: '0.001', stopAtrMultiple: '2', targetAtrMultiple: '4', trailingAtrMultiple: '2' };

  it('emits LONG and SHORT candidates with mandatory ATR stops', () => {
    const long = evaluateFuturesTrendV1('BTC/USDC-PERP', bullish, '0.0001', config);
    const short = evaluateFuturesTrendV1('BTC/USDC-PERP', bearish, '0.0001', config);
    expect(long.signalType).toBe('LONG');
    expect(new Decimal(long.stopLoss ?? 0).lt(long.price)).toBe(true);
    expect(short.signalType).toBe('SHORT');
    expect(new Decimal(short.stopLoss ?? 0).gt(short.price)).toBe(true);
  });

  it('holds when funding is extreme', () => {
    expect(evaluateFuturesTrendV1('BTC/USDC-PERP', bullish, '0.01', config).reason).toBe('FUNDING_EXTREME');
  });

  it('never loosens LONG or SHORT trailing stops', () => {
    expect(updateTrailingStop('LONG', '110', '115', '5', '2')).toBe('110');
    expect(updateTrailingStop('LONG', '110', '130', '5', '2')).toBe('120');
    expect(updateTrailingStop('SHORT', '90', '95', '5', '2')).toBe('90');
    expect(updateTrailingStop('SHORT', '90', '70', '5', '2')).toBe('80');
  });

  it('exits LONG and SHORT on stop or trend break', () => {
    expect(evaluateFuturesTrendV1('BTC/USDC-PERP', bearish, '0', config, { side: 'LONG', stopLoss: '0' }).signalType).toBe('EXIT');
    expect(evaluateFuturesTrendV1('BTC/USDC-PERP', bullish, '0', config, { side: 'SHORT', stopLoss: '999999' }).signalType).toBe('EXIT');
  });
});

describe('SPOT_SWING_V1', () => {
  it('emits BUY in a bullish trend with valid momentum and volume', () => {
    const rows = createHistoricalFixture('BTC/USDC', '60000', 100);
    const last = rows.at(-1);
    const signal = evaluateSpotSwingV1(withLast(rows, { volume: new Decimal(last?.volume ?? 0).mul(3).toFixed() }), {
      emaFastPeriod: 20, emaSlowPeriod: 50, rsiPeriod: 14, rsiEntryMin: '0', rsiEntryMax: '100',
      atrPeriod: 14, volumePeriod: 20, momentumPeriod: 20, maxPullbackDeviation: '1', maxAtrRatio: '1',
      stopAtrMultiple: '2', targetAtrMultiple: '4',
    });
    expect(signal.signalType).toBe('BUY');
  });

  it('does not chase an overbought market', () => {
    const rows = createHistoricalFixture('BTC/USDC', '60000', 100);
    const signal = evaluateSpotSwingV1(rows, { ...{
      emaFastPeriod: 20, emaSlowPeriod: 50, rsiPeriod: 14, rsiEntryMin: '50', rsiEntryMax: '1',
      atrPeriod: 14, volumePeriod: 20, momentumPeriod: 20, maxPullbackDeviation: '1', maxAtrRatio: '1',
      stopAtrMultiple: '2', targetAtrMultiple: '4',
    } });
    expect(signal.signalType).toBe('HOLD');
    expect(signal.reason).toBe('OVERBOUGHT_NO_CHASE');
  });

  it('exits an open position at its stop', () => {
    const rows = createHistoricalFixture('BTC/USDC', '60000', 100);
    const price = rows.at(-1)?.close ?? '0';
    expect(evaluateSpotSwingV1(rows, undefined, '1', new Decimal(price).plus(1).toFixed()).signalType).toBe('EXIT');
  });
});
