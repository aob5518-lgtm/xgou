import { describe, expect, it } from 'vitest';
import { MockCredentialProvider } from '@xgou/key-management';
import { MemoryAlertSink } from '@xgou/observability';
import {
  authorizeExecution, buildExecutionAuditTrail, checkPreTradeRisk, DryRunExchangeAdapter, ExchangeOrderMapper,
  InMemoryGlobalTradingStateStore, LiveSpotExchangeAdapter, OperationalRiskController,
  OrderRecoveryWorker, type ExchangeCapabilities, type InternalOrder,
} from './production.js';

const capabilities: ExchangeCapabilities = { spotSupported: true, futuresSupported: true, maxLeverage: '3', reduceOnlySupported: true, clientOrderIdSupported: true, positionMode: 'ONE_WAY', supportedPairs: ['BTC/USDC', 'BTC/USDC-PERP'], minNotional: '10', stepSize: '0.0001', tickSize: '0.01' };
const spot: InternalOrder = { strategy: 'spot', cycle: 'c1', proposalId: 'p1', symbol: 'BTC/USDC', side: 'BUY', type: 'MARKET', quantity: '0.01', reduceOnly: false, timeInForce: 'IOC' };
const mapper = new ExchangeOrderMapper({ 'BTC/USDC': 'BTCUSDC', 'BTC/USDC-PERP': 'BTCUSDT-PERP' }, capabilities);
const auth = authorizeExecution({ proposalId: 'p1', riskDecisionId: 'r1', executionMode: 'DRY_RUN', environment: 'test', policyStatus: 'APPROVED', riskStatus: 'APPROVED', globalTradingState: 'ACTIVE', authorizedBy: 'risk-engine', referencePrice: '60000', maxPriceDeviationBps: '100' }, new Date('2026-09-28T00:00:00Z'));

const approvedRisk = (order = mapper.map(spot)) => checkPreTradeRisk({ now: new Date('2026-09-28T00:00:10Z'), authorization: auth, order, freshPrice: '60010', availableBalance: '10000', currentExposure: '0', maxExposure: '10000', globalState: 'ACTIVE', exchangeHealth: 'HEALTHY', marketDataHealthy: true, credentialHealthy: true, unknownOrders: 0, maxUnknownOrders: 3 });

describe('Phase 5 dry-run execution safety', () => {
  it('serializes internal symbols and stable idempotent clientOrderId', () => {
    expect(mapper.map(spot)).toMatchObject({ exchangeSymbol: 'BTCUSDC', clientOrderId: 'xgou:spot:c1:p1' });
  });
  it('runs a complete dry-run spot path without network send and deduplicates submit', async () => {
    const credential = await new MockCredentialProvider(new Map([['vault://exchange/test/spot', { metadata: { exchange: 'fixture', environment: 'test', permissions: ['READ', 'SPOT_TRADE'] } }]])).resolve('vault://exchange/test/spot');
    const adapter = new DryRunExchangeAdapter('fixture');
    const order = mapper.map(spot);
    const first = adapter.execute(order, auth, approvedRisk(order), credential);
    const duplicate = adapter.execute(order, auth, approvedRisk(order), credential);
    expect(first).toBe(duplicate);
    expect(first.networkSent).toBe(false);
  });
  it('runs futures SHORT semantics with leverage, stop-era risk and no transport', async () => {
    const order = mapper.map({ ...spot, proposalId: 'perp1', symbol: 'BTC/USDC-PERP', side: 'OPEN_SHORT', leverage: '2', stopPrice: '62000' });
    const credential = await new MockCredentialProvider(new Map([['vault://exchange/test/perp', { metadata: { exchange: 'fixture', environment: 'test', permissions: ['READ', 'FUTURES_TRADE'] } }]])).resolve('vault://exchange/test/perp');
    const execution = new DryRunExchangeAdapter('fixture').execute(order, { ...auth, proposalId: 'perp1' }, approvedRisk(order), credential);
    expect(execution.order).toMatchObject({ side: 'OPEN_SHORT', leverage: '2', stopPrice: '62000', exchangeSymbol: 'BTCUSDT-PERP' });
    expect(execution.networkSent).toBe(false);
  });
  it('blocks stale authorizations, price drift, unhealthy inputs and increased exposure during emergency stop', () => {
    const result = checkPreTradeRisk({ now: new Date('2026-09-28T00:01:00Z'), authorization: auth, order: mapper.map(spot), freshPrice: '70000', availableBalance: '1', currentExposure: '9999', maxExposure: '10000', globalState: 'EMERGENCY_STOP', exchangeHealth: 'UNHEALTHY', marketDataHealthy: false, credentialHealthy: false, unknownOrders: 3, maxUnknownOrders: 3 });
    expect(result.approved).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining(['AUTHORIZATION_EXPIRED', 'PRICE_DEVIATION', 'GLOBAL_REDUCE_ONLY', 'CREDENTIAL_UNHEALTHY']));
  });
  it('allows risk reduction during emergency stop and requires manual resume', async () => {
    const states = new InMemoryGlobalTradingStateStore();
    const alerts = new MemoryAlertSink();
    await new OperationalRiskController(states, alerts).critical('RECONCILIATION_MISMATCH', 'critical drift');
    expect(states.get()).toBe('EMERGENCY_STOP');
    expect(() => { states.set('ACTIVE', false); }).toThrow('manual resume');
    const reduce = mapper.map({ ...spot, proposalId: 'reduce', side: 'REDUCE_LONG', reduceOnly: true });
    expect(checkPreTradeRisk({ now: new Date('2026-09-28T00:00:10Z'), authorization: auth, order: reduce, freshPrice: '60000', availableBalance: '10000', currentExposure: '1000', maxExposure: '10000', globalState: states.get(), exchangeHealth: 'HEALTHY', marketDataHealthy: true, credentialHealthy: true, unknownOrders: 0, maxUnknownOrders: 3 }).approved).toBe(true);
  });
  it('recovers an UNKNOWN order by clientOrderId exactly once without resubmit', async () => {
    const order = { clientOrderId: 'xgou:spot:c1:p1', state: 'UNKNOWN' as const, fills: 0 };
    const worker = new OrderRecoveryWorker();
    const recovered = await worker.recover(order, { query: () => Promise.resolve('FILLED') });
    expect(recovered).toMatchObject({ state: 'FILLED', fills: 1 });
    expect(await worker.recover(recovered, { query: () => Promise.resolve('FILLED') })).toMatchObject({ fills: 1 });
  });
  it('keeps all live transports fail closed', () => {
    expect(() => new LiveSpotExchangeAdapter(true)).toThrow('not enabled');
    expect(() => new LiveSpotExchangeAdapter().submit()).toThrow('Live execution');
  });
  it('retains the complete signal-to-audit trace for every dry-run order', () => {
    expect(buildExecutionAuditTrail({ signalId: 's1', proposalId: 'p1', riskDecisionId: 'r1', authorizationId: 'a1', executionId: 'e1', auditId: 'audit1' }).map((event) => event.type)).toEqual(['SIGNAL', 'PROPOSAL', 'RISK_DECISION', 'EXECUTION_AUTHORIZATION', 'DRY_RUN_EXECUTION', 'AUDIT']);
  });
});
