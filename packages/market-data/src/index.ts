import { Decimal } from 'decimal.js';

export type SpotSymbol = 'BTC/USDC' | 'ETH/USDC' | 'SOL/USDC';
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface MarketMetadata {
  readonly symbol: SpotSymbol;
  readonly priceSourcePair: string;
  readonly source: string;
  readonly exchangeTimestamp: number;
  readonly receivedAt: string;
}

export interface Ticker extends MarketMetadata {
  readonly price: string;
  readonly bid: string;
  readonly ask: string;
}

export interface Candle extends MarketMetadata {
  readonly timeframe: Timeframe;
  readonly openTime: number;
  readonly closeTime: number;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume: string;
}

export interface OrderBook extends MarketMetadata {
  readonly bids: readonly { readonly price: string; readonly quantity: string }[];
  readonly asks: readonly { readonly price: string; readonly quantity: string }[];
}

export interface Stats24h extends MarketMetadata {
  readonly changePercent: string;
  readonly quoteVolume: string;
  readonly high: string;
  readonly low: string;
}

export interface MarketDataAdapter {
  getTicker(symbol: SpotSymbol): Promise<Ticker>;
  getOHLCV(symbol: SpotSymbol, timeframe: Timeframe, limit: number): Promise<readonly Candle[]>;
  getOrderBook(symbol: SpotSymbol): Promise<OrderBook>;
  get24hStats(symbol: SpotSymbol): Promise<Stats24h>;
  healthCheck(): Promise<boolean>;
}

export interface MarketDataCache {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

export class MemoryMarketDataCache implements MarketDataCache {
  private readonly values = new Map<string, { readonly expiresAt: number; readonly value: unknown }>();

  async get(key: string): Promise<unknown> {
    const found = this.values.get(key);
    if (!found || found.expiresAt <= Date.now()) return Promise.resolve(null);
    return Promise.resolve(found.value);
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    this.values.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1_000 });
    return Promise.resolve();
  }
}

const SOURCE_PAIRS: Readonly<Record<SpotSymbol, string>> = {
  'BTC/USDC': 'BTCUSDT',
  'ETH/USDC': 'ETHUSDT',
  'SOL/USDC': 'SOLUSDT',
};

type HttpFetcher = (url: string) => Promise<{ readonly ok: boolean; json(): Promise<unknown> }>;

export class PublicMarketDataAdapter implements MarketDataAdapter {
  constructor(
    private readonly baseUrl = 'https://api.binance.com',
    private readonly cache: MarketDataCache = new MemoryMarketDataCache(),
    private readonly fetcher: HttpFetcher = (url) => {
      const runtimeFetch = (globalThis as unknown as { fetch?: HttpFetcher }).fetch;
      if (!runtimeFetch) throw new Error('global fetch is unavailable');
      return runtimeFetch(url);
    },
  ) {}

  async getTicker(symbol: SpotSymbol): Promise<Ticker> {
    return this.cached(`ticker:${symbol}`, 2, async () => {
      const pair = SOURCE_PAIRS[symbol];
      const [book, price] = await Promise.all([
        this.read(`/api/v3/ticker/bookTicker?symbol=${pair}`),
        this.read(`/api/v3/ticker/price?symbol=${pair}`),
      ]);
      const receivedAt = new Date().toISOString();
      const now = Date.now();
      return {
        symbol, priceSourcePair: pair, source: 'BINANCE_PUBLIC', exchangeTimestamp: now, receivedAt,
        price: this.field(price, 'price'), bid: this.field(book, 'bidPrice'), ask: this.field(book, 'askPrice'),
      };
    });
  }

  async getOHLCV(symbol: SpotSymbol, timeframe: Timeframe, limit: number): Promise<readonly Candle[]> {
    if (!Number.isSafeInteger(limit) || limit < 2 || limit > 1_000) throw new Error('OHLCV limit must be between 2 and 1000');
    return this.cached(`ohlcv:${symbol}:${timeframe}:${String(limit)}`, 10, async () => {
      const pair = SOURCE_PAIRS[symbol];
      const raw = await this.read(`/api/v3/klines?symbol=${pair}&interval=${timeframe}&limit=${String(limit)}`);
      if (!Array.isArray(raw)) throw new Error('invalid OHLCV response');
      const receivedAt = new Date().toISOString();
      return raw.map((row) => {
        if (!Array.isArray(row) || row.length < 7) throw new Error('invalid OHLCV row');
        return {
          symbol, priceSourcePair: pair, source: 'BINANCE_PUBLIC', timeframe,
          exchangeTimestamp: this.numeric(row[6]), receivedAt, openTime: this.numeric(row[0]), closeTime: this.numeric(row[6]),
          open: this.decimal(row[1]), high: this.decimal(row[2]), low: this.decimal(row[3]),
          close: this.decimal(row[4]), volume: this.decimal(row[5]),
        };
      });
    });
  }

  async getOrderBook(symbol: SpotSymbol): Promise<OrderBook> {
    return this.cached(`book:${symbol}`, 2, async () => {
      const pair = SOURCE_PAIRS[symbol];
      const raw = await this.read(`/api/v3/depth?symbol=${pair}&limit=20`);
      return {
        symbol, priceSourcePair: pair, source: 'BINANCE_PUBLIC', exchangeTimestamp: Date.now(), receivedAt: new Date().toISOString(),
        bids: this.levels(raw, 'bids'), asks: this.levels(raw, 'asks'),
      };
    });
  }

  async get24hStats(symbol: SpotSymbol): Promise<Stats24h> {
    return this.cached(`stats:${symbol}`, 10, async () => {
      const pair = SOURCE_PAIRS[symbol];
      const raw = await this.read(`/api/v3/ticker/24hr?symbol=${pair}`);
      return {
        symbol, priceSourcePair: pair, source: 'BINANCE_PUBLIC', exchangeTimestamp: Date.now(), receivedAt: new Date().toISOString(),
        changePercent: this.field(raw, 'priceChangePercent'), quoteVolume: this.field(raw, 'quoteVolume'),
        high: this.field(raw, 'highPrice'), low: this.field(raw, 'lowPrice'),
      };
    });
  }

  async healthCheck(): Promise<boolean> {
    try { await this.read('/api/v3/ping'); return true; } catch { return false; }
  }

  private async cached<T>(key: string, ttl: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.cache.get(key);
    if (cached !== null) return cached as T;
    const loaded = await loader();
    await this.cache.set(key, loaded, ttl);
    return loaded;
  }

  private async read(path: string): Promise<unknown> {
    const response = await this.fetcher(`${this.baseUrl}${path}`);
    if (!response.ok) throw new Error(`public market data request failed: ${path}`);
    return response.json();
  }

  private field(value: unknown, field: string): string {
    if (typeof value !== 'object' || value === null || !(field in value)) throw new Error(`missing market data field: ${field}`);
    return this.decimal((value as Record<string, unknown>)[field]);
  }

  private decimal(value: unknown): string {
    if (typeof value !== 'string' && typeof value !== 'number') throw new Error('invalid decimal market value');
    return new Decimal(value).toFixed();
  }

  private numeric(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(parsed)) throw new Error('invalid market timestamp');
    return parsed;
  }

  private levels(value: unknown, key: 'bids' | 'asks'): readonly { readonly price: string; readonly quantity: string }[] {
    if (typeof value !== 'object' || value === null) throw new Error('invalid order book');
    const rows = (value as Record<string, unknown>)[key];
    if (!Array.isArray(rows)) throw new Error('invalid order book levels');
    return rows.map((row) => {
      if (!Array.isArray(row) || row.length < 2) throw new Error('invalid order book level');
      return { price: this.decimal(row[0]), quantity: this.decimal(row[1]) };
    });
  }
}

export class MockMarketDataAdapter implements MarketDataAdapter {
  private readonly bySymbol: Readonly<Record<SpotSymbol, readonly Candle[]>>;

  constructor(fixtures?: Partial<Readonly<Record<SpotSymbol, readonly Candle[]>>>) {
    this.bySymbol = {
      'BTC/USDC': fixtures?.['BTC/USDC'] ?? createHistoricalFixture('BTC/USDC', '60000', 1_000),
      'ETH/USDC': fixtures?.['ETH/USDC'] ?? createHistoricalFixture('ETH/USDC', '3000', 1_000),
      'SOL/USDC': fixtures?.['SOL/USDC'] ?? createHistoricalFixture('SOL/USDC', '150', 1_000),
    };
  }

  async getTicker(symbol: SpotSymbol): Promise<Ticker> {
    const candle = this.latest(symbol);
    return Promise.resolve({
      symbol, priceSourcePair: candle.priceSourcePair, source: candle.source,
      exchangeTimestamp: candle.exchangeTimestamp, receivedAt: candle.receivedAt,
      price: candle.close, bid: new Decimal(candle.close).mul('0.9999').toFixed(), ask: new Decimal(candle.close).mul('1.0001').toFixed(),
    });
  }

  async getOHLCV(symbol: SpotSymbol, timeframe: Timeframe, limit: number): Promise<readonly Candle[]> {
    const rows = this.bySymbol[symbol];
    return Promise.resolve(rows.slice(Math.max(0, rows.length - limit)).map((row) => ({ ...row, timeframe })));
  }

  async getOrderBook(symbol: SpotSymbol): Promise<OrderBook> {
    const ticker = await this.getTicker(symbol);
    return { ...ticker, bids: [{ price: ticker.bid, quantity: '100' }], asks: [{ price: ticker.ask, quantity: '100' }] };
  }

  async get24hStats(symbol: SpotSymbol): Promise<Stats24h> {
    const rows = this.bySymbol[symbol];
    const last = this.latest(symbol);
    const first = rows.at(-24) ?? rows[0] ?? last;
    return Promise.resolve({
      symbol, priceSourcePair: last.priceSourcePair, source: last.source,
      exchangeTimestamp: last.exchangeTimestamp, receivedAt: last.receivedAt,
      changePercent: new Decimal(last.close).div(first.close).minus(1).mul(100).toFixed(),
      quoteVolume: rows.slice(-24).reduce((sum, row) => sum.plus(new Decimal(row.volume).mul(row.close)), new Decimal(0)).toFixed(),
      high: Decimal.max(...rows.slice(-24).map((row) => new Decimal(row.high))).toFixed(),
      low: Decimal.min(...rows.slice(-24).map((row) => new Decimal(row.low))).toFixed(),
    });
  }

  async healthCheck(): Promise<boolean> { return Promise.resolve(true); }

  private latest(symbol: SpotSymbol): Candle {
    const row = this.bySymbol[symbol].at(-1);
    if (!row) throw new Error(`no fixture for ${symbol}`);
    return row;
  }
}

export const createHistoricalFixture = (symbol: SpotSymbol, startPrice: string, size: number): readonly Candle[] => {
  const start = Date.now() - size * 60_000;
  let price = new Decimal(startPrice);
  return Array.from({ length: size }, (_, index) => {
    const wave = new Decimal(index % 6).minus(2).mul('0.0008');
    const open = price;
    const close = open.mul(new Decimal('1.0007').plus(wave));
    price = close;
    const openTime = start + index * 60_000;
    return {
      symbol, timeframe: '1m', priceSourcePair: SOURCE_PAIRS[symbol], source: 'FIXTURE',
      exchangeTimestamp: openTime + 59_999, receivedAt: new Date(openTime + 60_000).toISOString(),
      openTime, closeTime: openTime + 59_999, open: open.toFixed(), close: close.toFixed(),
      high: Decimal.max(open, close).mul('1.001').toFixed(), low: Decimal.min(open, close).mul('0.999').toFixed(),
      volume: new Decimal(100).plus(index % 11).toFixed(),
    } satisfies Candle;
  });
};
