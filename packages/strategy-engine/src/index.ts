import { Decimal } from 'decimal.js';
import type { Candle, SpotSymbol } from '@xgou/market-data';

export const sma = (values: readonly Decimal.Value[], period: number): Decimal => {
  const window = values.slice(-period).map((value) => new Decimal(value));
  if (window.length !== period) throw new Error('insufficient values for SMA');
  return window.reduce((sum, value) => sum.plus(value), new Decimal(0)).div(period);
};

export const emaSeries = (values: readonly Decimal.Value[], period: number): readonly Decimal[] => {
  if (values.length < period) throw new Error('insufficient values for EMA');
  const decimalValues = values.map((value) => new Decimal(value));
  const multiplier = new Decimal(2).div(period + 1);
  const seed = decimalValues.slice(0, period).reduce((sum, value) => sum.plus(value), new Decimal(0)).div(period);
  const output: Decimal[] = Array.from({ length: period - 1 }, () => seed);
  let current = seed;
  output.push(current);
  for (const value of decimalValues.slice(period)) {
    current = value.minus(current).mul(multiplier).plus(current);
    output.push(current);
  }
  return output;
};

export const ema = (values: readonly Decimal.Value[], period: number): Decimal => {
  const value = emaSeries(values, period).at(-1);
  if (!value) throw new Error('EMA did not produce a value');
  return value;
};

export const rsi = (values: readonly Decimal.Value[], period: number): Decimal => {
  if (values.length <= period) throw new Error('insufficient values for RSI');
  const window = values.slice(-(period + 1)).map((value) => new Decimal(value));
  let gains = new Decimal(0);
  let losses = new Decimal(0);
  for (let index = 1; index < window.length; index += 1) {
    const current = window[index];
    const previous = window[index - 1];
    if (!current || !previous) throw new Error('invalid RSI window');
    const change = current.minus(previous);
    if (change.gte(0)) gains = gains.plus(change); else losses = losses.plus(change.abs());
  }
  if (losses.isZero()) return new Decimal(100);
  const rs = gains.div(period).div(losses.div(period));
  return new Decimal(100).minus(new Decimal(100).div(rs.plus(1)));
};

export const atr = (candles: readonly Candle[], period: number): Decimal => {
  if (candles.length <= period) throw new Error('insufficient candles for ATR');
  const rows = candles.slice(-(period + 1));
  const ranges: Decimal[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const candle = rows[index];
    const previous = rows[index - 1];
    if (!candle || !previous) throw new Error('invalid ATR window');
    const high = new Decimal(candle.high);
    const low = new Decimal(candle.low);
    const previousClose = new Decimal(previous.close);
    ranges.push(Decimal.max(high.minus(low), high.minus(previousClose).abs(), low.minus(previousClose).abs()));
  }
  return sma(ranges, period);
};

export const volatility = (values: readonly Decimal.Value[], period: number): Decimal => {
  const window = values.slice(-(period + 1)).map((value) => new Decimal(value));
  if (window.length !== period + 1) throw new Error('insufficient values for volatility');
  const returns = window.slice(1).map((value, index) => value.div(window[index] ?? value).minus(1));
  const mean = returns.reduce((sum, value) => sum.plus(value), new Decimal(0)).div(returns.length);
  const variance = returns.reduce((sum, value) => sum.plus(value.minus(mean).pow(2)), new Decimal(0)).div(returns.length);
  return variance.sqrt();
};

export const momentum = (values: readonly Decimal.Value[], period: number): Decimal => {
  if (values.length <= period) throw new Error('insufficient values for momentum');
  const last = new Decimal(values.at(-1) ?? 0);
  const base = new Decimal(values.at(-(period + 1)) ?? 0);
  if (base.isZero()) throw new Error('momentum base cannot be zero');
  return last.div(base).minus(1);
};

export const trendStrength = (fast: Decimal.Value, slow: Decimal.Value, price: Decimal.Value): Decimal => {
  const denominator = new Decimal(price);
  if (denominator.isZero()) return new Decimal(0);
  return new Decimal(fast).minus(slow).abs().div(denominator);
};

export interface SpotSwingConfig {
  readonly emaFastPeriod: number;
  readonly emaSlowPeriod: number;
  readonly rsiPeriod: number;
  readonly rsiEntryMin: string;
  readonly rsiEntryMax: string;
  readonly atrPeriod: number;
  readonly volumePeriod: number;
  readonly momentumPeriod: number;
  readonly maxPullbackDeviation: string;
  readonly maxAtrRatio: string;
  readonly stopAtrMultiple: string;
  readonly targetAtrMultiple: string;
}

export const SPOT_SWING_V1_CONFIG: SpotSwingConfig = {
  emaFastPeriod: 20, emaSlowPeriod: 50, rsiPeriod: 14, rsiEntryMin: '50', rsiEntryMax: '70',
  atrPeriod: 14, volumePeriod: 20, momentumPeriod: 20, maxPullbackDeviation: '0.04',
  maxAtrRatio: '0.05', stopAtrMultiple: '2', targetAtrMultiple: '4',
};

export type SpotSignalType = 'BUY' | 'REDUCE' | 'EXIT' | 'HOLD';

export interface SpotSignal {
  readonly symbol: SpotSymbol;
  readonly signalType: SpotSignalType;
  readonly strength: string;
  readonly price: string;
  readonly stopLoss: string | null;
  readonly takeProfit: string | null;
  readonly reason: string;
  readonly marketDataTimestamp: number;
  readonly indicators: Readonly<Record<string, string>>;
}

export const evaluateSpotSwingV1 = (
  candles: readonly Candle[],
  config: SpotSwingConfig = SPOT_SWING_V1_CONFIG,
  currentQuantity = '0',
  activeStopLoss?: string,
): SpotSignal => {
  if (candles.length < Math.max(config.emaSlowPeriod, config.volumePeriod, config.atrPeriod) + 1) {
    throw new Error('insufficient candles for SPOT_SWING_V1');
  }
  const last = candles.at(-1);
  if (!last) throw new Error('missing latest candle');
  const closes = candles.map((candle) => candle.close);
  const volumes = candles.map((candle) => candle.volume);
  const price = new Decimal(last.close);
  const fast = ema(closes, config.emaFastPeriod);
  const slow = ema(closes, config.emaSlowPeriod);
  const rsiValue = rsi(closes, config.rsiPeriod);
  const atrValue = atr(candles, config.atrPeriod);
  const volumeAverage = sma(volumes.slice(0, -1), config.volumePeriod);
  const momentumValue = momentum(closes, config.momentumPeriod);
  const pullback = price.minus(fast).abs().div(fast);
  const atrRatio = atrValue.div(price);
  const hasPosition = new Decimal(currentQuantity).gt(0);
  const indicators = {
    ema20: fast.toFixed(), ema50: slow.toFixed(), rsi14: rsiValue.toFixed(), atr14: atrValue.toFixed(),
    volumeSma20: volumeAverage.toFixed(), momentum20: momentumValue.toFixed(),
    volatility: volatility(closes, config.momentumPeriod).toFixed(), trendStrength: trendStrength(fast, slow, price).toFixed(),
  };
  if (hasPosition && activeStopLoss && price.lte(activeStopLoss)) {
    return { symbol: last.symbol, signalType: 'EXIT', strength: '1', price: price.toFixed(), stopLoss: activeStopLoss, takeProfit: null, reason: 'STOP_LOSS', marketDataTimestamp: last.exchangeTimestamp, indicators };
  }
  if (hasPosition && fast.lt(slow)) {
    return { symbol: last.symbol, signalType: 'EXIT', strength: '0.9', price: price.toFixed(), stopLoss: activeStopLoss ?? null, takeProfit: null, reason: 'TREND_BREAK', marketDataTimestamp: last.exchangeTimestamp, indicators };
  }
  const entry = fast.gt(slow)
    && rsiValue.gte(config.rsiEntryMin) && rsiValue.lte(config.rsiEntryMax)
    && new Decimal(last.volume).gt(volumeAverage)
    && pullback.lte(config.maxPullbackDeviation)
    && atrRatio.lte(config.maxAtrRatio)
    && momentumValue.gt(0);
  if (entry && !hasPosition) {
    return {
      symbol: last.symbol, signalType: 'BUY', strength: Decimal.min(1, momentumValue.mul(10).plus('0.5')).toFixed(),
      price: price.toFixed(), stopLoss: price.minus(atrValue.mul(config.stopAtrMultiple)).toFixed(),
      takeProfit: price.plus(atrValue.mul(config.targetAtrMultiple)).toFixed(), reason: 'TREND_MOMENTUM_PULLBACK',
      marketDataTimestamp: last.exchangeTimestamp, indicators,
    };
  }
  const reason = rsiValue.gt(config.rsiEntryMax) ? 'OVERBOUGHT_NO_CHASE' : 'NO_ENTRY_EDGE';
  return { symbol: last.symbol, signalType: 'HOLD', strength: '0', price: price.toFixed(), stopLoss: activeStopLoss ?? null, takeProfit: null, reason, marketDataTimestamp: last.exchangeTimestamp, indicators };
};

export class HistoricalFixtureRunner {
  run(candles: readonly Candle[], positionQuantity = '0', stopLoss?: string): readonly SpotSignal[] {
    const start = SPOT_SWING_V1_CONFIG.emaSlowPeriod + 1;
    const results: SpotSignal[] = [];
    for (let size = start; size <= candles.length; size += 1) {
      results.push(evaluateSpotSwingV1(candles.slice(0, size), SPOT_SWING_V1_CONFIG, positionQuantity, stopLoss));
    }
    return results;
  }
}
