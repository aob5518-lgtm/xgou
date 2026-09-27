import { describe, expect, it } from 'vitest';
import type { CredentialHandle, CredentialPermission } from '@xgou/key-management';
import { BinanceClientOrderIdCodec, BinanceFuturesSandboxAdapter, BinanceSpotSandboxAdapter } from '../src/index.js';

const enabled = process.env.RUN_BINANCE_SANDBOX_E2E === 'true';
const suite = enabled ? describe : describe.skip;
const gate = { executionMode: 'SANDBOX', transportEnabled: 'true', environment: 'TESTNET' };

const credential = (reference: string, permissions: readonly CredentialPermission[], apiKey: string | undefined, apiSecret: string | undefined): CredentialHandle => {
  if (!apiKey || !apiSecret) throw new Error(`missing protected secret for ${reference}`);
  return {
    reference,
    metadata: { exchange: 'BINANCE', environment: 'test', permissions },
    use: async <T>(operation: (opaque: object) => Promise<T>) => operation({ apiKey, apiSecret }),
    toJSON: () => ({ reference, metadata: { exchange: 'BINANCE', environment: 'test', permissions } }),
  };
};

suite('protected Binance testnet E2E', () => {
  it('executes a tiny Spot BUY/query/fill/SELL lifecycle and leaves no open order', async () => {
    const adapter = new BinanceSpotSandboxAdapter(credential('vault://exchange/binance-testnet/spot', ['READ', 'SPOT_TRADE'], process.env.BINANCE_SPOT_TESTNET_API_KEY, process.env.BINANCE_SPOT_TESTNET_API_SECRET), gate);
    const server = await adapter.serverTime(); adapter.client.clock.update(server.serverTime);
    expect(Math.abs(adapter.client.clock.driftMs)).toBeLessThanOrEqual(1_000);
    const accountBefore = await adapter.account();
    expect(accountBefore.balances.length).toBeGreaterThan(0);
    const codec = new BinanceClientOrderIdCodec();
    const nonce = `${Date.now()}`;
    const buyId = codec.encode({ strategy: 'e2e-spot', cycle: nonce, proposalId: `buy-${nonce}` });
    const buy = await adapter.placeMarketOrder({ symbol: 'BTCUSDT', side: 'BUY', quoteOrderQty: process.env.BINANCE_SANDBOX_E2E_SPOT_NOTIONAL ?? '10', clientOrderId: buyId });
    const queried = await adapter.queryOrder('BTCUSDT', buyId);
    expect(queried.orderId).toBe(buy.orderId);
    const trades = await adapter.trades('BTCUSDT', buy.orderId);
    expect(trades.length).toBeGreaterThan(0);
    if (Number(queried.executedQty) <= 0) throw new Error('spot BUY did not fill');
    const sellId = codec.encode({ strategy: 'e2e-spot', cycle: nonce, proposalId: `sell-${nonce}` });
    await adapter.placeMarketOrder({ symbol: 'BTCUSDT', side: 'SELL', quantity: queried.executedQty, clientOrderId: sellId });
    expect((await adapter.openOrders('BTCUSDT')).length).toBe(0);
  }, 60_000);

  it('executes a tiny Futures LONG/protective-stop/reduce-only close lifecycle', async () => {
    const adapter = new BinanceFuturesSandboxAdapter(credential('vault://exchange/binance-testnet/futures', ['READ', 'FUTURES_TRADE'], process.env.BINANCE_FUTURES_TESTNET_API_KEY, process.env.BINANCE_FUTURES_TESTNET_API_SECRET), gate);
    const server = await adapter.serverTime(); adapter.client.clock.update(server.serverTime);
    const mode = await adapter.positionMode();
    expect(mode.dualSidePosition).toBe(false);
    await adapter.setLeverage('BTCUSDT', 2);
    try { await adapter.setIsolatedMargin('BTCUSDT'); } catch (error) { if (!String(error).includes('-4046')) throw error; }
    const mark = Number((await adapter.markPrice('BTCUSDT')).markPrice);
    const quantity = process.env.BINANCE_SANDBOX_E2E_FUTURES_QUANTITY ?? '0.002';
    const nonce = `${Date.now()}`; const codec = new BinanceClientOrderIdCodec();
    const openId = codec.encode({ strategy: 'e2e-fut', cycle: nonce, proposalId: `open-${nonce}` });
    const stopId = codec.encode({ strategy: 'e2e-stop', cycle: nonce, proposalId: `stop-${nonce}` });
    const closeId = codec.encode({ strategy: 'e2e-fut', cycle: nonce, proposalId: `close-${nonce}` });
    let stopPlaced = false;
    try {
      await adapter.placeOpeningMarketOrder({ symbol: 'BTCUSDT', side: 'BUY', quantity, clientOrderId: openId, stopPrice: String(mark * 0.98) });
      await adapter.placeProtectiveStop({ symbol: 'BTCUSDT', side: 'SELL', stopPrice: String(mark * 0.98), clientOrderId: stopId }); stopPlaced = true;
      expect((await adapter.positions('BTCUSDT')).some((row) => Number(row.positionAmt) > 0)).toBe(true);
      await adapter.closePosition({ symbol: 'BTCUSDT', side: 'SELL', quantity, clientOrderId: closeId });
    } finally {
      if (stopPlaced) await adapter.cancelOrder('BTCUSDT', stopId).catch(() => undefined);
    }
    expect((await adapter.positions('BTCUSDT')).every((row) => Number(row.positionAmt) === 0)).toBe(true);
    expect((await adapter.openOrders('BTCUSDT')).length).toBe(0);
  }, 60_000);
});
