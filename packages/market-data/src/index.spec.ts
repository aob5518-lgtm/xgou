import { describe, expect, it } from 'vitest';
import { MockMarketDataAdapter, MockPerpMarketDataAdapter, createHistoricalFixture } from './index.js';

describe('market data adapters', () => {
  it('provides a deterministic 1000-candle fixture with source metadata', async () => {
    const fixture = createHistoricalFixture('BTC/USDC', '60000', 1_000);
    const adapter = new MockMarketDataAdapter({ 'BTC/USDC': fixture });
    const candles = await adapter.getOHLCV('BTC/USDC', '1h', 1_000);
    expect(candles).toHaveLength(1_000);
    expect(candles.at(-1)?.source).toBe('FIXTURE');
    expect(candles.at(-1)?.priceSourcePair).toBe('BTCUSDT');
  });
});

describe('perpetual public-data contract', () => {
  it('exposes fixture mark, index, funding and open interest without credentials', async () => {
    const adapter = new MockPerpMarketDataAdapter(1_000_000);
    const [mark, index, funding, interest, candles] = await Promise.all([
      adapter.getMarkPrice('BTC/USDC-PERP'), adapter.getIndexPrice('BTC/USDC-PERP'),
      adapter.getFundingRate('BTC/USDC-PERP'), adapter.getOpenInterest('BTC/USDC-PERP'),
      adapter.getOHLCV('BTC/USDC-PERP', '1h', 120),
    ]);
    expect(mark.priceSourcePair).toBe('BTCUSDT');
    expect(index.value).toBe(mark.value);
    expect(funding.value).toBe('0.0001');
    expect(interest.value).toBe('100000000');
    expect(candles).toHaveLength(120);
  });
});
