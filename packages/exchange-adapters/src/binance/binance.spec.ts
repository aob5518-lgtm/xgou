import { describe, expect, it, vi } from 'vitest';
import { MockCredentialProvider } from '@xgou/key-management';
import {
  BINANCE_FUTURES_TESTNET_BASE_URL,
  BINANCE_SPOT_TESTNET_BASE_URL,
  BinanceApiError,
  BinanceClientOrderIdCodec,
  BinanceClock,
  BinanceFuturesSandboxAdapter,
  BinanceHttpClient,
  BinanceSigner,
  BinanceSpotSandboxAdapter,
  assertBinanceSandboxGate,
  assertBinanceSandboxHost,
  assertBinanceMinNotional,
  quantizeBinanceOrder,
  serializeBinanceParameters,
  mapBinanceError,
  normalizeBinanceOrderStatus,
} from './index.js';

const spotCredential = () => new MockCredentialProvider(new Map([['vault://exchange/binance-testnet/spot', {
  metadata: { exchange: 'BINANCE', environment: 'test' as const, permissions: ['READ', 'SPOT_TRADE'] as const },
  opaque: { apiKey: 'test-api-key', apiSecret: 'test-api-secret' },
}]])).resolve('vault://exchange/binance-testnet/spot');

const futuresCredential = () => new MockCredentialProvider(new Map([['vault://exchange/binance-testnet/futures', {
  metadata: { exchange: 'BINANCE', environment: 'test' as const, permissions: ['READ', 'FUTURES_TRADE'] as const },
  opaque: { apiKey: 'test-api-key', apiSecret: 'test-api-secret' },
}]])).resolve('vault://exchange/binance-testnet/futures');

const gate = { executionMode: 'SANDBOX', transportEnabled: 'true', environment: 'TESTNET' };

describe('Binance Phase 6 sandbox safety', () => {
  it('pins only current official testnet hosts and rejects production', () => {
    expect(assertBinanceSandboxHost('TESTNET', BINANCE_SPOT_TESTNET_BASE_URL).hostname).toBe('testnet.binance.vision');
    expect(assertBinanceSandboxHost('TESTNET', BINANCE_FUTURES_TESTNET_BASE_URL).hostname).toBe('demo-fapi.binance.com');
    expect(() => assertBinanceSandboxHost('PRODUCTION', BINANCE_SPOT_TESTNET_BASE_URL)).toThrow('production environment');
    expect(() => assertBinanceSandboxHost('TESTNET', 'https://api.binance.com/api')).toThrow('production host');
    expect(() => assertBinanceSandboxHost('TESTNET', 'https://fapi.binance.com')).toThrow('production host');
  });

  it('requires all three sandbox gates', () => {
    expect(() => { assertBinanceSandboxGate(gate); }).not.toThrow();
    expect(() => { assertBinanceSandboxGate({ ...gate, executionMode: 'DRY_RUN' }); }).toThrow('EXECUTION_MODE');
    expect(() => { assertBinanceSandboxGate({ ...gate, transportEnabled: 'false' }); }).toThrow('disabled');
    expect(() => { assertBinanceSandboxGate({ ...gate, environment: 'PRODUCTION' }); }).toThrow('TESTNET');
  });

  it('rejects credentials with withdrawal permission', async () => {
    const credential = await new MockCredentialProvider(new Map([['vault://bad', {
      metadata: { exchange: 'BINANCE', environment: 'test' as const, permissions: ['READ', 'SPOT_TRADE', 'WITHDRAW'] as const },
      opaque: { apiKey: 'key', apiSecret: 'secret' },
    }]])).resolve('vault://bad');
    expect(() => new BinanceSpotSandboxAdapter(credential, gate)).toThrow('withdraw-enabled');
  });
});

describe('Binance signing and order identity', () => {
  it('matches the official Binance HMAC-SHA256 golden vector', () => {
    const parameters = {
      symbol: 'LTCBTC', side: 'BUY', type: 'LIMIT', timeInForce: 'GTC', quantity: 1, price: 0.1,
      recvWindow: 5000, timestamp: 1499827319559,
    };
    expect(serializeBinanceParameters(parameters)).toBe('symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559');
    expect(new BinanceSigner().sign(parameters, 'NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j').signature)
      .toBe('c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71');
  });

  it('generates stable compliant ids without collision over 100k proposals', () => {
    const codec = new BinanceClientOrderIdCodec();
    const ids = new Set<string>();
    for (let index = 0; index < 100_000; index += 1) ids.add(codec.encode({ strategy: 'spot-core', cycle: `cycle-${String(index % 997)}`, proposalId: `proposal-${String(index)}` }));
    expect(ids.size).toBe(100_000);
    const value = codec.encode({ strategy: 'spot-core', cycle: 'cycle-42', proposalId: 'proposal-42' });
    expect(value.length).toBeLessThanOrEqual(36);
    expect(codec.encode({ strategy: 'spot-core', cycle: 'cycle-42', proposalId: 'proposal-42' })).toBe(value);
    expect(codec.decodeHint(value).strategyHint).toBe('spot-c');
  });
});

describe('Binance metadata and clock', () => {
  const metadata = { symbol: 'BTCUSDT', status: 'TRADING', baseAsset: 'BTC', quoteAsset: 'USDT', filters: [
    { filterType: 'LOT_SIZE', minQty: '0.001000', maxQty: '100.000000', stepSize: '0.001000' },
    { filterType: 'PRICE_FILTER', minPrice: '0.10', maxPrice: '1000000.00', tickSize: '0.10' },
    { filterType: 'MIN_NOTIONAL', minNotional: '5' },
  ] };
  it('rounds quantity and price down using Decimal metadata', () => {
    expect(quantizeBinanceOrder(metadata, '0.001999', '60000.19')).toEqual({ quantity: '0.001', price: '60000.1' });
    expect(() => { assertBinanceMinNotional(metadata, '0.001', '1000'); }).toThrow('minimum notional');
  });
  it('blocks signed traffic when clock drift is unsafe', () => {
    const clock = new BinanceClock(1_000); clock.update(Date.now() + 1_001);
    expect(() => { clock.assertHealthy(); }).toThrow('clock drift');
  });
});

describe('Binance status and error mapping', () => {
  it('normalizes exchange order states without treating unknown values as success', () => {
    expect(normalizeBinanceOrderStatus('NEW')).toBe('ACKNOWLEDGED');
    expect(normalizeBinanceOrderStatus('PARTIALLY_FILLED')).toBe('PARTIALLY_FILLED');
    expect(normalizeBinanceOrderStatus('FILLED')).toBe('FILLED');
    expect(normalizeBinanceOrderStatus('mystery')).toBe('UNKNOWN');
  });
  it('classifies rate, clock, auth, validation and unknown execution errors', () => {
    expect(mapBinanceError(429)).toBe('RATE_LIMIT');
    expect(mapBinanceError(400, -1021)).toBe('CLOCK_DRIFT');
    expect(mapBinanceError(401, -2015)).toBe('AUTHENTICATION');
    expect(mapBinanceError(400, -1013)).toBe('VALIDATION');
    expect(mapBinanceError(504, -1007)).toBe('UNKNOWN_EXECUTION');
  });
});

describe('Binance authenticated transports', () => {
  it('uses the credential only inside handle.use and never places a production order', async () => {
    const credential = await spotCredential();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ balances: [] }), { status: 200 }));
    const adapter = new BinanceSpotSandboxAdapter(credential, gate, fetcher);
    await adapter.account();
    const call = fetcher.mock.calls[0];
    if (!call) throw new Error('fetch was not called');
    const [url, init] = call;
    const requestUrl = url instanceof URL ? url.href : url instanceof Request ? url.url : url;
    expect(requestUrl).toContain('testnet.binance.vision/api/v3/account');
    expect(requestUrl).not.toContain('api.binance.com');
    expect(new Headers(init?.headers).get('X-MBX-APIKEY')).toBe('test-api-key');
    expect(requestUrl).not.toContain('test-api-secret');
  });

  it('does not retry a write with an unknown outcome', async () => {
    const credential = await spotCredential();
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('timeout'));
    const adapter = new BinanceSpotSandboxAdapter(credential, gate, fetcher);
    await expect(adapter.placeMarketOrder({ symbol: 'BTCUSDT', side: 'BUY', quantity: '0.001', clientOrderId: 'xg-test-cycle-1234567890123456' })).rejects.toMatchObject({ executionUnknown: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('uses bounded retries only for safe reads', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: -1000, msg: 'temporary' }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ serverTime: 123 }), { status: 200 }));
    const client = new BinanceHttpClient({ environment: 'TESTNET', baseUrl: BINANCE_SPOT_TESTNET_BASE_URL, fetch: fetcher });
    await expect(client.public('/v3/time')).resolves.toEqual({ serverTime: 123 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('maps 5xx and -1007 to UNKNOWN for client-order-id recovery', async () => {
    const credential = await spotCredential();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ code: -1007, msg: 'Timeout waiting for response from backend server.' }), { status: 504 }));
    const adapter = new BinanceSpotSandboxAdapter(credential, gate, fetcher);
    const promise = adapter.placeMarketOrder({ symbol: 'BTCUSDT', side: 'BUY', quantity: '0.001', clientOrderId: 'xg-test-cycle-1234567890123456' });
    await expect(promise).rejects.toBeInstanceOf(BinanceApiError);
    await expect(promise).rejects.toMatchObject({ executionUnknown: true });
  });

  it('requires one-way safe futures credentials, max 2x leverage, and a protective stop', async () => {
    const credential = await futuresCredential();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ leverage: 2 }), { status: 200 }));
    const adapter = new BinanceFuturesSandboxAdapter(credential, gate, fetcher);
    expect(() => adapter.setLeverage('BTCUSDT', 3)).toThrow('2x');
    expect(() => adapter.placeOpeningMarketOrder({ symbol: 'BTCUSDT', side: 'BUY', quantity: '0.001', clientOrderId: 'xg-fut-cycle-1234567890123456', stopPrice: '' })).toThrow('protective stop');
    await adapter.setLeverage('BTCUSDT', 2);
    const request = fetcher.mock.calls[0]?.[0];
    const requestUrl = request instanceof URL ? request.href : request instanceof Request ? request.url : request;
    expect(requestUrl).toContain('demo-fapi.binance.com/fapi/v1/leverage');
  });

  it('forbids withdrawal and transfer paths in the HTTP boundary', async () => {
    const client = new BinanceHttpClient({ environment: 'TESTNET', baseUrl: BINANCE_SPOT_TESTNET_BASE_URL, credential: await spotCredential(), fetch: vi.fn() });
    await expect(client.signed('POST', '/v3/capital/withdraw/apply', {})).rejects.toThrow('forbidden');
  });
});
