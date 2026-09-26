import { describe, expect, it } from 'vitest';
import { classifyReconciliation, DryRunPostingAdapter, evaluateOperationalRisk, ExchangeHealthService, ExchangeRateLimitManager, planWorkerRecovery, ReferencePriceService } from './operational.js';

describe('operational controls and chaos fixtures', () => {
  it('blocks stale or divergent market sources', () => {
    const result = new ReferencePriceService().compare({ source: 'primary', price: '100', capturedAt: new Date(0) }, { source: 'secondary', price: '90', capturedAt: new Date(0) }, '100', new Date(10_000), 1000);
    expect(result.healthy).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining(['STALE_PRICE', 'PRICE_SOURCE_DEVIATION']));
  });
  it('marks API timeout and time drift unhealthy', () => {
    expect(new ExchangeHealthService().evaluate({ publicApi: false, privateReadApi: false, latencyMs: 5000, errorRate: 1, timeDriftMs: 5000 })).toBe('UNHEALTHY');
  });
  it('prevents rate-limit exhaustion before a 429', () => {
    const limiter = new ExchangeRateLimitManager(10, 1000);
    expect(limiter.acquire(8, 0)).toBe(true);
    expect(limiter.acquire(3, 0)).toBe(false);
    expect(limiter.acquire(1, 500)).toBe(false);
  });
  it('classifies unhealthy reconciliation as critical and stops operational risk', () => {
    const snapshot = { source: 'fixture', internal: '100', external: '90', difference: '10', timestamp: new Date(), sourceHealth: 'UNHEALTHY', referenceId: 'r1' };
    expect(classifyReconciliation(snapshot, '0.01', '1')).toBe('CRITICAL');
    expect(evaluateOperationalRisk({ exchangeHealth: 'HEALTHY', marketDataHealth: 'HEALTHY', keyProviderHealth: 'HEALTHY', reconciliationHealth: 'CRITICAL', unknownOrders: 0, errorRate: 0, globalState: 'ACTIVE', capturedAt: new Date() }, 3, 0.05)).toBe('EMERGENCY_STOP');
  });
  it('keeps trading postings separate from the principal ledger', async () => {
    const adapter = new DryRunPostingAdapter();
    await adapter.postFill({ orderId: 'dry' });
    await adapter.postFee({ orderId: 'dry' });
    expect(adapter.postings.map((posting) => posting.type)).toEqual(['FILL', 'FEE']);
  });
  it('recovers every worker from Postgres after Redis loss and blocks on transient database failure', () => {
    expect(planWorkerRecovery({ databaseAvailable: true, redisAvailable: false })).toBe('REBUILD_REDIS_FROM_DATABASE');
    expect(planWorkerRecovery({ databaseAvailable: false, redisAvailable: true })).toBe('BLOCKED_DATABASE_UNAVAILABLE');
  });
});
