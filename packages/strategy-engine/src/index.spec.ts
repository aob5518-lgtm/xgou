import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { createHistoricalFixture, type Candle } from '@xgou/market-data';
import { atr, ema, evaluateSpotSwingV1, rsi, sma } from './index.js';

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
