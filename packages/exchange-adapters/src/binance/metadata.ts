import { Decimal } from 'decimal.js';

export interface BinanceSymbolFilter {
  readonly filterType: string;
  readonly minPrice?: string;
  readonly maxPrice?: string;
  readonly tickSize?: string;
  readonly minQty?: string;
  readonly maxQty?: string;
  readonly stepSize?: string;
  readonly minNotional?: string;
  readonly notional?: string;
}

export interface BinanceSymbolMetadata {
  readonly symbol: string;
  readonly status: string;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly filters: readonly BinanceSymbolFilter[];
}

const roundDown = (value: string, increment: string): string => {
  const input = new Decimal(value);
  const step = new Decimal(increment);
  if (!input.isFinite() || input.lt(0) || !step.isFinite() || step.lte(0)) throw new Error('invalid quantization input');
  return input.div(step).toDecimalPlaces(0, Decimal.ROUND_DOWN).mul(step).toFixed(step.decimalPlaces());
};

const filter = (metadata: BinanceSymbolMetadata, type: string): BinanceSymbolFilter => {
  const found = metadata.filters.find((item) => item.filterType === type);
  if (!found) throw new Error(`missing Binance ${type} filter for ${metadata.symbol}`);
  return found;
};

export const quantizeBinanceOrder = (metadata: BinanceSymbolMetadata, quantity: string, price?: string): { readonly quantity: string; readonly price?: string } => {
  if (metadata.status !== 'TRADING') throw new Error(`${metadata.symbol} is not trading`);
  const lot = filter(metadata, 'LOT_SIZE');
  const normalizedQuantity = roundDown(quantity, lot.stepSize ?? '0');
  if (new Decimal(normalizedQuantity).lt(lot.minQty ?? '0') || new Decimal(normalizedQuantity).gt(lot.maxQty ?? normalizedQuantity)) throw new Error('quantity violates LOT_SIZE');
  if (price === undefined) return { quantity: normalizedQuantity };
  const priceFilter = filter(metadata, 'PRICE_FILTER');
  const normalizedPrice = roundDown(price, priceFilter.tickSize ?? '0');
  if (new Decimal(normalizedPrice).lt(priceFilter.minPrice ?? '0') || new Decimal(normalizedPrice).gt(priceFilter.maxPrice ?? normalizedPrice)) throw new Error('price violates PRICE_FILTER');
  return { quantity: normalizedQuantity, price: normalizedPrice };
};

export const assertBinanceMinNotional = (metadata: BinanceSymbolMetadata, quantity: string, price: string): void => {
  const notionalFilter = metadata.filters.find((item) => ['MIN_NOTIONAL', 'NOTIONAL'].includes(item.filterType));
  const minimum = notionalFilter?.minNotional ?? notionalFilter?.notional;
  if (minimum && new Decimal(quantity).mul(price).lt(minimum)) throw new Error('order violates minimum notional');
};

export class BinanceSymbolMapper {
  constructor(private readonly symbols: Readonly<Record<string, string>> = { 'BTC/USDC': 'BTCUSDT', 'ETH/USDC': 'ETHUSDT', 'SOL/USDC': 'SOLUSDT', 'BTC/USDT': 'BTCUSDT', 'ETH/USDT': 'ETHUSDT', 'SOL/USDT': 'SOLUSDT' }) {}
  toExchange(internalSymbol: string): string {
    const symbol = this.symbols[internalSymbol];
    if (!symbol) throw new Error(`unsupported Binance sandbox symbol: ${internalSymbol}`);
    return symbol;
  }
}
