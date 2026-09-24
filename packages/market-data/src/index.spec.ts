import { describe, expect, it } from 'vitest';
import { MockMarketDataAdapter, createHistoricalFixture } from './index.js';

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
