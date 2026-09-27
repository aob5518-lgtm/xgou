import type { CredentialHandle } from '@xgou/key-management';
import { assertTradeOnlyCredential } from '@xgou/key-management';
import { BINANCE_FUTURES_TESTNET_BASE_URL, BINANCE_SPOT_TESTNET_BASE_URL, assertBinanceSandboxGate, type BinanceSandboxGateInput } from './environment.js';
import { BinanceHttpClient } from './http-client.js';
import type { BinanceParameters } from './signing.js';

export interface BinanceOrderResponse { readonly symbol: string; readonly orderId: number; readonly clientOrderId: string; readonly status: string; readonly executedQty: string; readonly cummulativeQuoteQty?: string; readonly avgPrice?: string; }

const assertPermissions = (credential: CredentialHandle, required: 'SPOT_TRADE' | 'FUTURES_TRADE'): void => {
  assertTradeOnlyCredential(credential.metadata);
  if (credential.metadata.environment !== 'test' || !credential.metadata.permissions.includes('READ') || !credential.metadata.permissions.includes(required)) throw new Error(`Binance testnet credential requires READ and ${required}`);
};

export class BinanceSpotSandboxAdapter {
  readonly client: BinanceHttpClient;
  constructor(credential: CredentialHandle, gate: BinanceSandboxGateInput, fetcher?: typeof globalThis.fetch) {
    assertBinanceSandboxGate(gate); assertPermissions(credential, 'SPOT_TRADE');
    this.client = new BinanceHttpClient({ environment: 'TESTNET', baseUrl: BINANCE_SPOT_TESTNET_BASE_URL, credential, ...(fetcher ? { fetch: fetcher } : {}) });
  }
  serverTime() { return this.client.public<{ serverTime: number }>('/v3/time'); }
  exchangeInfo(symbol?: string) { return this.client.public<{ symbols: readonly unknown[] }>('/v3/exchangeInfo', symbol ? { symbol } : {}); }
  account() { return this.client.signed<{ balances: readonly { asset: string; free: string; locked: string }[] }>('GET', '/v3/account'); }
  placeMarketOrder(input: { symbol: string; side: 'BUY' | 'SELL'; quantity?: string; quoteOrderQty?: string; clientOrderId: string }) { return this.client.signed<BinanceOrderResponse>('POST', '/v3/order', { ...input, type: 'MARKET', newClientOrderId: input.clientOrderId }); }
  queryOrder(symbol: string, clientOrderId: string) { return this.client.signed<BinanceOrderResponse>('GET', '/v3/order', { symbol, origClientOrderId: clientOrderId }); }
  cancelOrder(symbol: string, clientOrderId: string) { return this.client.signed<BinanceOrderResponse>('DELETE', '/v3/order', { symbol, origClientOrderId: clientOrderId }); }
  openOrders(symbol?: string) { return this.client.signed<readonly BinanceOrderResponse[]>('GET', '/v3/openOrders', symbol ? { symbol } : {}); }
  trades(symbol: string, orderId?: number) { return this.client.signed<readonly unknown[]>('GET', '/v3/myTrades', { symbol, orderId }); }
}

export class BinanceFuturesSandboxAdapter {
  readonly client: BinanceHttpClient;
  constructor(credential: CredentialHandle, gate: BinanceSandboxGateInput, fetcher?: typeof globalThis.fetch) {
    assertBinanceSandboxGate(gate); assertPermissions(credential, 'FUTURES_TRADE');
    this.client = new BinanceHttpClient({ environment: 'TESTNET', baseUrl: BINANCE_FUTURES_TESTNET_BASE_URL, credential, ...(fetcher ? { fetch: fetcher } : {}) });
  }
  serverTime() { return this.client.public<{ serverTime: number }>('/fapi/v1/time'); }
  exchangeInfo() { return this.client.public<{ symbols: readonly unknown[] }>('/fapi/v1/exchangeInfo'); }
  markPrice(symbol: string) { return this.client.public<{ symbol: string; markPrice: string }>('/fapi/v1/premiumIndex', { symbol }); }
  account() { return this.client.signed<Record<string, unknown>>('GET', '/fapi/v3/account'); }
  positions(symbol?: string) { return this.client.signed<readonly Record<string, unknown>[]>('GET', '/fapi/v3/positionRisk', symbol ? { symbol } : {}); }
  positionMode() { return this.client.signed<{ dualSidePosition: boolean }>('GET', '/fapi/v1/positionSide/dual'); }
  setLeverage(symbol: string, leverage: number) { if (leverage < 1 || leverage > 2) throw new Error('Sandbox leverage must be between 1x and 2x'); return this.client.signed('POST', '/fapi/v1/leverage', { symbol, leverage }); }
  setIsolatedMargin(symbol: string) { return this.client.signed('POST', '/fapi/v1/marginType', { symbol, marginType: 'ISOLATED' }); }
  placeOrder(parameters: BinanceParameters & { readonly symbol: string; readonly side: string; readonly type: string; readonly newClientOrderId: string }) { return this.client.signed<BinanceOrderResponse>('POST', '/fapi/v1/order', parameters); }
  placeOpeningMarketOrder(input: { symbol: string; side: 'BUY' | 'SELL'; quantity: string; clientOrderId: string; stopPrice: string }) {
    if (!input.stopPrice) throw new Error('Futures opening order requires protective stop');
    return this.placeOrder({ symbol: input.symbol, side: input.side, type: 'MARKET', quantity: input.quantity, newClientOrderId: input.clientOrderId, positionSide: 'BOTH' });
  }
  placeProtectiveStop(input: { symbol: string; side: 'BUY' | 'SELL'; stopPrice: string; clientOrderId: string }) { return this.placeOrder({ symbol: input.symbol, side: input.side, type: 'STOP_MARKET', stopPrice: input.stopPrice, closePosition: true, newClientOrderId: input.clientOrderId, workingType: 'MARK_PRICE' }); }
  closePosition(input: { symbol: string; side: 'BUY' | 'SELL'; quantity: string; clientOrderId: string }) { return this.placeOrder({ symbol: input.symbol, side: input.side, type: 'MARKET', quantity: input.quantity, reduceOnly: true, positionSide: 'BOTH', newClientOrderId: input.clientOrderId }); }
  async openWithProtection(input: { symbol: string; side: 'BUY' | 'SELL'; quantity: string; openClientOrderId: string; stopClientOrderId: string; emergencyCloseClientOrderId: string; stopPrice: string }, onCritical: (reason: string) => Promise<void>) {
    const open = await this.placeOpeningMarketOrder({ symbol: input.symbol, side: input.side, quantity: input.quantity, clientOrderId: input.openClientOrderId, stopPrice: input.stopPrice });
    const closingSide = input.side === 'BUY' ? 'SELL' : 'BUY';
    try {
      const protectiveStop = await this.placeProtectiveStop({ symbol: input.symbol, side: closingSide, stopPrice: input.stopPrice, clientOrderId: input.stopClientOrderId });
      return { open, protectiveStop };
    } catch (stopError) {
      try {
        await this.closePosition({ symbol: input.symbol, side: closingSide, quantity: input.quantity, clientOrderId: input.emergencyCloseClientOrderId });
      } catch (closeError) {
        await onCritical('BINANCE_FUTURES_NAKED_POSITION_CLOSE_UNCONFIRMED');
        throw new AggregateError([stopError, closeError], 'Protective stop and emergency reduce-only close both failed', { cause: closeError });
      }
      throw new Error('Protective stop failed; exposure was closed reduce-only', { cause: stopError });
    }
  }
  queryOrder(symbol: string, clientOrderId: string) { return this.client.signed<BinanceOrderResponse>('GET', '/fapi/v1/order', { symbol, origClientOrderId: clientOrderId }); }
  cancelOrder(symbol: string, clientOrderId: string) { return this.client.signed<BinanceOrderResponse>('DELETE', '/fapi/v1/order', { symbol, origClientOrderId: clientOrderId }); }
  openOrders(symbol?: string) { return this.client.signed<readonly BinanceOrderResponse[]>('GET', '/fapi/v1/openOrders', symbol ? { symbol } : {}); }
  trades(symbol: string) { return this.client.signed<readonly unknown[]>('GET', '/fapi/v1/userTrades', { symbol }); }
  income(symbol?: string) { return this.client.signed<readonly unknown[]>('GET', '/fapi/v1/income', symbol ? { symbol } : {}); }
}
