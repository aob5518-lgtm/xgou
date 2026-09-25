import { Decimal } from 'decimal.js';
import type { Candle, FuturesSymbol, SpotSymbol } from '@xgou/market-data';

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

export interface FuturesTrendConfig {
  readonly emaFastPeriod: number;
  readonly emaMediumPeriod: number;
  readonly emaSlowPeriod: number;
  readonly atrPeriod: number;
  readonly rsiPeriod: number;
  readonly momentumPeriod: number;
  readonly minTrendStrength: string;
  readonly maxAtrRatio: string;
  readonly longRsiMax: string;
  readonly shortRsiMin: string;
  readonly maxFundingRateAbs: string;
  readonly stopAtrMultiple: string;
  readonly targetAtrMultiple: string;
  readonly trailingAtrMultiple: string;
}

export const FUTURES_TREND_V1_CONFIG: FuturesTrendConfig = {
  emaFastPeriod: 20, emaMediumPeriod: 50, emaSlowPeriod: 100, atrPeriod: 14,
  rsiPeriod: 14, momentumPeriod: 20, minTrendStrength: '0.001', maxAtrRatio: '0.06',
  longRsiMax: '75', shortRsiMin: '25', maxFundingRateAbs: '0.001',
  stopAtrMultiple: '2', targetAtrMultiple: '4', trailingAtrMultiple: '2',
};

export type FuturesSignalType = 'LONG' | 'SHORT' | 'REDUCE' | 'EXIT' | 'HOLD';
export type FuturesPositionSide = 'LONG' | 'SHORT';

export interface FuturesPositionInput {
  readonly side: FuturesPositionSide;
  readonly stopLoss: string;
  readonly highestMarkPrice?: string;
  readonly lowestMarkPrice?: string;
}

export interface FuturesSignal {
  readonly symbol: FuturesSymbol;
  readonly signalType: FuturesSignalType;
  readonly strength: string;
  readonly requestedLeverage: string;
  readonly price: string;
  readonly stopLoss: string | null;
  readonly takeProfit: string | null;
  readonly trailingStop: string | null;
  readonly reason: string;
  readonly marketDataTimestamp: number;
  readonly indicators: Readonly<Record<string, string>>;
}

export const updateTrailingStop = (
  side: FuturesPositionSide,
  current: Decimal.Value | null,
  mark: Decimal.Value,
  atrValue: Decimal.Value,
  multiple: Decimal.Value,
): string => {
  const candidate = side === 'LONG'
    ? new Decimal(mark).minus(new Decimal(atrValue).mul(multiple))
    : new Decimal(mark).plus(new Decimal(atrValue).mul(multiple));
  if (current === null) return candidate.toFixed();
  return side === 'LONG' ? Decimal.max(current, candidate).toFixed() : Decimal.min(current, candidate).toFixed();
};

export const evaluateFuturesTrendV1 = (
  symbol: FuturesSymbol,
  candles: readonly Candle[],
  fundingRate: Decimal.Value,
  config: FuturesTrendConfig = FUTURES_TREND_V1_CONFIG,
  position?: FuturesPositionInput,
): FuturesSignal => {
  if (candles.length < config.emaSlowPeriod + 1) throw new Error('insufficient candles for FUTURES_TREND_V1');
  const last = candles.at(-1);
  if (!last) throw new Error('missing latest futures candle');
  const closes = candles.map((candle) => candle.close);
  const price = new Decimal(last.close);
  const fast = ema(closes, config.emaFastPeriod);
  const medium = ema(closes, config.emaMediumPeriod);
  const slow = ema(closes, config.emaSlowPeriod);
  const atrValue = atr(candles, config.atrPeriod);
  const rsiValue = rsi(closes, config.rsiPeriod);
  const momentumValue = momentum(closes, config.momentumPeriod);
  const strength = trendStrength(fast, medium, price);
  const volatilityValue = volatility(closes, config.momentumPeriod);
  const atrRatio = atrValue.div(price);
  const funding = new Decimal(fundingRate);
  const indicators = {
    ema20: fast.toFixed(), ema50: medium.toFixed(), ema100: slow.toFixed(), atr14: atrValue.toFixed(),
    rsi14: rsiValue.toFixed(), momentum20: momentumValue.toFixed(), trendStrength: strength.toFixed(),
    volatility: volatilityValue.toFixed(), fundingRate: funding.toFixed(),
  };
  if (position) {
    const trailing = updateTrailingStop(position.side, position.stopLoss, price, atrValue, config.trailingAtrMultiple);
    const stopTriggered = position.side === 'LONG' ? price.lte(position.stopLoss) : price.gte(position.stopLoss);
    const trendBroken = position.side === 'LONG' ? fast.lt(medium) : fast.gt(medium);
    return {
      symbol, signalType: stopTriggered || trendBroken ? 'EXIT' : 'HOLD', strength: stopTriggered ? '1' : trendBroken ? '0.9' : '0',
      requestedLeverage: '1', price: price.toFixed(), stopLoss: position.stopLoss, takeProfit: null, trailingStop: trailing,
      reason: stopTriggered ? 'STOP_LOSS' : trendBroken ? 'TREND_BREAK' : 'POSITION_MANAGED', marketDataTimestamp: last.exchangeTimestamp, indicators,
    };
  }
  if (funding.abs().gt(config.maxFundingRateAbs)) return { symbol, signalType: 'HOLD', strength: '0', requestedLeverage: '1', price: price.toFixed(), stopLoss: null, takeProfit: null, trailingStop: null, reason: 'FUNDING_EXTREME', marketDataTimestamp: last.exchangeTimestamp, indicators };
  if (atrRatio.gt(config.maxAtrRatio) || strength.lt(config.minTrendStrength)) return { symbol, signalType: 'HOLD', strength: '0', requestedLeverage: '1', price: price.toFixed(), stopLoss: null, takeProfit: null, trailingStop: null, reason: atrRatio.gt(config.maxAtrRatio) ? 'HIGH_VOLATILITY' : 'TREND_WEAK', marketDataTimestamp: last.exchangeTimestamp, indicators };
  const isLong = fast.gt(medium) && medium.gt(slow) && momentumValue.gt(0) && rsiValue.lt(config.longRsiMax);
  const isShort = fast.lt(medium) && medium.lt(slow) && momentumValue.lt(0) && rsiValue.gt(config.shortRsiMin);
  if (!isLong && !isShort) return { symbol, signalType: 'HOLD', strength: '0', requestedLeverage: '1', price: price.toFixed(), stopLoss: null, takeProfit: null, trailingStop: null, reason: 'SIDEWAYS', marketDataTimestamp: last.exchangeTimestamp, indicators };
  const side: FuturesPositionSide = isLong ? 'LONG' : 'SHORT';
  const direction = isLong ? new Decimal(1) : new Decimal(-1);
  const stopLoss = price.minus(direction.mul(atrValue).mul(config.stopAtrMultiple));
  const takeProfit = price.plus(direction.mul(atrValue).mul(config.targetAtrMultiple));
  const requestedLeverage = volatilityValue.lte('0.01') && strength.gte('0.01') ? '2' : volatilityValue.lte('0.03') ? '1.5' : '1';
  return { symbol, signalType: side, strength: Decimal.min(1, strength.mul(50).plus('0.5')).toFixed(), requestedLeverage, price: price.toFixed(), stopLoss: stopLoss.toFixed(), takeProfit: takeProfit.toFixed(), trailingStop: stopLoss.toFixed(), reason: 'TREND_CONFIRMED', marketDataTimestamp: last.exchangeTimestamp, indicators };
};
