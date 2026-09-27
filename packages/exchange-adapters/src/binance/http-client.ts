import type { CredentialHandle } from '@xgou/key-management';
import { assertTradeOnlyCredential } from '@xgou/key-management';
import type { MetricSink } from '@xgou/observability';
import { assertBinanceSandboxHost, assertNoBinanceWithdrawalPath, type BinanceEnvironment } from './environment.js';
import { BinanceSigner, serializeBinanceParameters, type BinanceParameters } from './signing.js';

interface OpaqueBinanceCredential { readonly apiKey: string; readonly apiSecret: string; }
const readCredential = (opaque: object): OpaqueBinanceCredential => {
  const value = opaque as Partial<OpaqueBinanceCredential>;
  if (typeof value.apiKey !== 'string' || !value.apiKey || typeof value.apiSecret !== 'string' || !value.apiSecret) throw new Error('invalid Binance credential payload');
  return { apiKey: value.apiKey, apiSecret: value.apiSecret };
};

export class BinanceApiError extends Error {
  constructor(readonly status: number, readonly code: number | undefined, message: string, readonly retryAfterMs?: number, readonly executionUnknown = false) { super(message); }
}

export class BinanceClock {
  private offsetMs = 0;
  constructor(private readonly maximumDriftMs = 1_000) {}
  update(serverTime: number, localTime = Date.now()): number { this.offsetMs = serverTime - localTime; return this.offsetMs; }
  now(localTime = Date.now()): number { return localTime + this.offsetMs; }
  assertHealthy(): void { if (Math.abs(this.offsetMs) > this.maximumDriftMs) throw new Error(`Binance clock drift exceeds ${String(this.maximumDriftMs)}ms`); }
  get driftMs(): number { return this.offsetMs; }
}

export class BinanceRateLimitManager {
  private blockedUntil = 0;
  private usedWeight = 0;
  beforeRequest(now = Date.now()): void { if (now < this.blockedUntil) throw new Error('Binance request blocked by Retry-After'); }
  observe(headers: Headers, now = Date.now()): void {
    for (const [name, value] of headers.entries()) if (name.toLowerCase().startsWith('x-mbx-used-weight')) this.usedWeight = Math.max(this.usedWeight, Number(value) || 0);
    const retryAfter = Number(headers.get('retry-after') ?? 0);
    if (retryAfter > 0) this.blockedUntil = now + retryAfter * 1_000;
  }
  snapshot(): { readonly usedWeight: number; readonly blockedUntil: number } { return { usedWeight: this.usedWeight, blockedUntil: this.blockedUntil }; }
}

export interface BinanceHttpClientOptions {
  readonly environment: BinanceEnvironment;
  readonly baseUrl: string;
  readonly credential?: CredentialHandle;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
  readonly recvWindow?: number;
  readonly clock?: BinanceClock;
  readonly rateLimits?: BinanceRateLimitManager;
  readonly metrics?: MetricSink;
}

export class BinanceHttpClient {
  private readonly baseUrl: URL;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly recvWindow: number;
  readonly clock: BinanceClock;
  readonly rateLimits: BinanceRateLimitManager;
  constructor(private readonly options: BinanceHttpClientOptions) {
    this.baseUrl = assertBinanceSandboxHost(options.environment, options.baseUrl);
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.recvWindow = options.recvWindow ?? 5_000;
    if (this.recvWindow > 5_000 || this.recvWindow <= 0) throw new Error('recvWindow must be in (0, 5000]');
    this.clock = options.clock ?? new BinanceClock();
    this.rateLimits = options.rateLimits ?? new BinanceRateLimitManager();
    if (options.credential) assertTradeOnlyCredential(options.credential.metadata);
  }

  async public<T>(path: string, parameters: BinanceParameters = {}): Promise<T> { return this.request<T>('GET', path, parameters, false); }
  async signed<T>(method: 'GET' | 'POST' | 'DELETE', path: string, parameters: BinanceParameters = {}): Promise<T> { return this.request<T>(method, path, parameters, true); }

  private async request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, parameters: BinanceParameters, signed: boolean, attempt = 0): Promise<T> {
    assertNoBinanceWithdrawalPath(path);
    this.rateLimits.beforeRequest();
    const perform = async (apiKey?: string, apiSecret?: string): Promise<T> => {
      const startedAt = Date.now();
      const signedParameters = signed ? { ...parameters, recvWindow: this.recvWindow, timestamp: this.clock.now() } : parameters;
      if (signed) this.clock.assertHealthy();
      const signer = new BinanceSigner();
      if (signed && !apiSecret) throw new Error('signed Binance request requires scoped secret');
      const signedPayload = signed ? signer.sign(signedParameters, apiSecret ?? '') : undefined;
      const encoded = signedPayload?.payload ?? serializeBinanceParameters(signedParameters);
      const signature = signedPayload?.signature;
      const payload = signature ? `${encoded}&signature=${signature}` : encoded;
      const url = new URL(`${this.baseUrl.origin}${this.baseUrl.pathname.replace(/\/$/, '')}${path}`);
      const headers = new Headers({ 'x-xgou-correlation-id': crypto.randomUUID() });
      if (apiKey) headers.set('X-MBX-APIKEY', apiKey);
      let body: string | undefined;
      if (method === 'GET' || method === 'DELETE') url.search = payload;
      else { headers.set('content-type', 'application/x-www-form-urlencoded'); body = payload; }
      const controller = new AbortController();
      const timeout = setTimeout(() => { controller.abort(); }, this.timeoutMs);
      try {
        const response = await this.fetcher(url, { method, headers, ...(body === undefined ? {} : { body }), signal: controller.signal });
        this.rateLimits.observe(response.headers);
        const labels = { exchange: 'BINANCE', environment: 'TESTNET', method, endpoint: path };
        this.options.metrics?.record('xgou_binance_testnet_requests', 1, labels);
        this.options.metrics?.record('xgou_order_latency_ms', Date.now() - startedAt, labels);
        this.options.metrics?.record('xgou_binance_clock_drift_ms', Math.abs(this.clock.driftMs), labels);
        this.options.metrics?.record('xgou_binance_used_weight', this.rateLimits.snapshot().usedWeight, labels);
        const data = await response.json() as T & { code?: number; msg?: string };
        if (!response.ok) {
          if (method === 'POST' && path.endsWith('/order')) this.options.metrics?.record('xgou_binance_testnet_order_errors', 1, labels);
          const retrySeconds = Number(response.headers.get('retry-after') ?? 0);
          throw new BinanceApiError(response.status, data.code, data.msg ?? `Binance HTTP ${String(response.status)}`, retrySeconds ? retrySeconds * 1_000 : undefined, response.status >= 500 || data.code === -1007);
        }
        if (method === 'POST' && path.endsWith('/order')) this.options.metrics?.record('xgou_binance_testnet_orders', 1, labels);
        return data;
      } catch (error) {
        if (error instanceof BinanceApiError) {
          if (method === 'GET' && attempt < 2 && (error.status === 429 || error.status >= 500)) {
            await new Promise<void>((resolve) => { setTimeout(resolve, Math.min(error.retryAfterMs ?? 50, 1_000)); });
            return await this.request<T>(method, path, parameters, signed, attempt + 1);
          }
          throw error;
        }
        if (method !== 'GET') {
          this.options.metrics?.record('xgou_binance_testnet_unknown_orders', 1, { exchange: 'BINANCE', environment: 'TESTNET', method, endpoint: path });
          throw new BinanceApiError(0, undefined, 'Binance write outcome is UNKNOWN', undefined, true);
        }
        if (attempt < 2) return await this.request<T>(method, path, parameters, signed, attempt + 1);
        throw error;
      } finally { clearTimeout(timeout); }
    };
    if (!signed) return perform();
    if (!this.options.credential) throw new Error('signed Binance request requires CredentialProvider handle');
    return this.options.credential.use(async (opaque) => { const credential = readCredential(opaque); return perform(credential.apiKey, credential.apiSecret); });
  }
}
