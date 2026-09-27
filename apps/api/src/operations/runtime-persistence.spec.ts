import { Decimal } from 'decimal.js';
import { afterEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../database/prisma.service.js';
import { DatabaseGlobalTradingStateStore } from './database-global-trading-state.store.js';
import { PersistentExecutionService, PersistentOrderRecoveryWorker } from './persistent-execution.service.js';
import { ProductionReadinessCollector } from './production-readiness.collector.js';
import { ProductionReadinessService, RoleReadinessService } from './readiness.js';
import { RuntimeAlertService } from './runtime-alert.service.js';

type State = 'ACTIVE' | 'REDUCE_ONLY' | 'PAUSED' | 'EMERGENCY_STOP';
interface Control { id: string; state: State; reason: string; manualResumeRequired: boolean; triggeredBy: string | null; triggeredAt: Date | null; updatedAt: Date; version: number }
interface DryRunRow { id: string; clientOrderId: string; state: string; fillCount: number; recoveryCount: number; createdAt: Date; [key: string]: unknown }

class FakeRuntimeDb {
  control: Control | null = null;
  readonly audits: unknown[] = [];
  readonly incidents: unknown[] = [];
  readonly authorizations = new Map<string, Record<string, unknown>>();
  readonly executions = new Map<string, DryRunRow>();
  readonly proposal = { id: '10000000-0000-4000-8000-000000000001' };
  readonly riskDecisionRow = { id: '20000000-0000-4000-8000-000000000001', proposalId: this.proposal.id, decision: 'APPROVED' };
  readonly credential = { id: '30000000-0000-4000-8000-000000000001', status: 'ACTIVE', expiresAt: null, credentialReference: 'vault://exchange/test/spot', permissions: ['READ', 'SPOT_TRADE'] };

  readonly globalTradingControl: {
    upsert: () => Promise<Control>;
    update: (input: { data: { state: State; reason: string; manualResumeRequired: boolean; triggeredBy: string; triggeredAt: Date | null; version: { increment: number } } }) => Promise<Control>;
  };

  constructor() {
    this.globalTradingControl = {
      upsert: () => {
        this.control ??= { id: 'GLOBAL', state: 'ACTIVE', reason: 'INITIALIZED', manualResumeRequired: false, triggeredBy: null, triggeredAt: null, updatedAt: new Date(), version: 1 };
        return Promise.resolve({ ...this.control });
      },
      update: (input) => {
        if (!this.control) throw new Error('missing control');
        this.control = { ...this.control, ...input.data, updatedAt: new Date(), version: this.control.version + input.data.version.increment };
        return Promise.resolve({ ...this.control });
      },
    };
  }

  readonly auditLog = { create: (input: unknown) => { this.audits.push(input); return Promise.resolve(input); } };
  readonly incident = { create: (input: unknown) => { this.incidents.push(input); return Promise.resolve(input); } };
  readonly tradeProposal = { findUnique: () => Promise.resolve(this.proposal) };
  readonly riskDecision = { findUnique: () => Promise.resolve(this.riskDecisionRow) };
  readonly exchangeCredentialProfile = { findUnique: () => Promise.resolve(this.credential) };
  readonly executionAuthorization = {
    findUnique: (input: { where: { id: string } }) => Promise.resolve(this.authorizations.get(input.where.id) ?? null),
    create: (input: { data: Record<string, unknown> }) => {
      const row = { id: `auth-${String(this.authorizations.size + 1)}`, ...input.data, referencePrice: new Decimal(String(input.data.referencePrice)), maxPriceDeviationBps: new Decimal(String(input.data.maxPriceDeviationBps)) };
      this.authorizations.set(row.id, row);
      return Promise.resolve(row);
    },
  };
  readonly dryRunExecution = {
    findUnique: (input: { where: { clientOrderId: string } }) => Promise.resolve(this.executions.get(input.where.clientOrderId) ?? null),
    create: (input: { data: Record<string, unknown> }) => {
      const clientOrderId = String(input.data.clientOrderId);
      if (this.executions.has(clientOrderId)) return Promise.reject(Object.assign(new Error('duplicate'), { code: 'P2002' }));
      const row: DryRunRow = { id: `execution-${String(this.executions.size + 1)}`, clientOrderId, state: String(input.data.state), fillCount: 0, recoveryCount: 0, createdAt: input.data.createdAt as Date, ...input.data };
      this.executions.set(clientOrderId, row);
      return Promise.resolve(row);
    },
    findMany: () => Promise.resolve([...this.executions.values()].filter((row) => row.state === 'UNKNOWN')),
    updateMany: (input: { where: { id: string; state: string }; data: { state: string; fillCount?: { increment: number }; recoveryCount: { increment: number }; recoveredAt: Date } }) => {
      const row = [...this.executions.values()].find((candidate) => candidate.id === input.where.id && candidate.state === input.where.state);
      if (!row) return Promise.resolve({ count: 0 });
      row.state = input.data.state;
      row.fillCount += input.data.fillCount?.increment ?? 0;
      row.recoveryCount += input.data.recoveryCount.increment;
      row.recoveredAt = input.data.recoveredAt;
      return Promise.resolve({ count: 1 });
    },
  };

  async $transaction<T>(callback: (transaction: FakeRuntimeDb) => Promise<T>): Promise<T> { return callback(this); }
}

const prismaFor = (db: FakeRuntimeDb): PrismaService => {
  return { db } as unknown as PrismaService;
};

const actor = '40000000-0000-4000-8000-000000000001';

describe('persistent production control plane', () => {
  afterEach(() => { delete process.env.ENABLE_OPERATIONAL_ALERTS; });

  it('survives restart, rejects automatic resume and permits an authorized manual resume', async () => {
    const db = new FakeRuntimeDb();
    const first = new DatabaseGlobalTradingStateStore(prismaFor(db));
    await first.set('EMERGENCY_STOP', false, 'critical reconciliation', actor, 'request-1');
    const restarted = new DatabaseGlobalTradingStateStore(prismaFor(db));
    expect(await restarted.get()).toBe('EMERGENCY_STOP');
    await expect(restarted.set('ACTIVE', false, 'health recovered', actor, 'request-2')).rejects.toThrow('manual resume');
    await restarted.set('ACTIVE', true, 'authorized manual resume', actor, 'request-3');
    expect(await restarted.get()).toBe('ACTIVE');
    expect(db.incidents).toHaveLength(1);
    expect(db.audits).toHaveLength(2);
  });

  it('persists authorization, rechecks the latest DB state and deduplicates concurrent/restarted dry runs', async () => {
    const db = new FakeRuntimeDb();
    const prisma = prismaFor(db);
    const states = new DatabaseGlobalTradingStateStore(prisma);
    const runtime = new PersistentExecutionService(prisma, states);
    const now = new Date('2026-09-30T00:00:00Z');
    const authorization = await runtime.authorize({ proposalId: db.proposal.id, riskDecisionId: db.riskDecisionRow.id, executionMode: 'DRY_RUN', environment: 'TESTNET', authorizedBy: 'risk-engine', referencePrice: '60000', maxPriceDeviationBps: '100', now });
    expect(authorization.expiresAt.getTime() - now.getTime()).toBe(30_000);
    await states.set('EMERGENCY_STOP', false, 'critical', actor, 'request-4');
    const input = {
      authorizationId: authorization.id, credentialProfileId: db.credential.id, exchange: 'fixture', now: new Date('2026-09-30T00:00:10Z'),
      order: { strategy: 'spot', cycle: 'cycle-1', proposalId: db.proposal.id, symbol: 'BTC/USDC', exchangeSymbol: 'BTCUSDC', clientOrderId: 'xgou:spot:cycle-1:p1', side: 'BUY' as const, type: 'MARKET' as const, quantity: '0.01', reduceOnly: false, timeInForce: 'IOC' as const },
      freshPrice: '60000', availableBalance: '10000', currentExposure: '0', maxExposure: '10000', exchangeHealth: 'HEALTHY' as const, marketDataHealthy: true, credentialHealthy: true, unknownOrders: 0, maxUnknownOrders: 3,
    };
    await expect(runtime.executeDryRun(input)).rejects.toThrow('GLOBAL_REDUCE_ONLY');
    await states.set('ACTIVE', true, 'manual resume', actor, 'request-5');
    const [first, concurrent] = await Promise.all([runtime.executeDryRun(input), runtime.executeDryRun(input)]);
    expect(first.id).toBe(concurrent.id);
    expect(db.executions.size).toBe(1);
    const restarted = new PersistentExecutionService(prisma, new DatabaseGlobalTradingStateStore(prisma));
    expect((await restarted.executeDryRun(input)).id).toBe(first.id);
    expect(db.executions.size).toBe(1);
  });

  it('recovers a persisted UNKNOWN execution exactly once after worker restart', async () => {
    const db = new FakeRuntimeDb();
    db.executions.set('xgou:spot:unknown', { id: 'execution-unknown', clientOrderId: 'xgou:spot:unknown', state: 'UNKNOWN', fillCount: 0, recoveryCount: 0, createdAt: new Date() });
    const prisma = prismaFor(db);
    const restarted = new PersistentOrderRecoveryWorker(prisma);
    expect(await restarted.recoverUnknown({ query: () => Promise.resolve('FILLED') })).toBe(1);
    expect(db.executions.get('xgou:spot:unknown')).toMatchObject({ state: 'FILLED', fillCount: 1, recoveryCount: 1 });
    expect(await new PersistentOrderRecoveryWorker(prisma).recoverUnknown({ query: () => Promise.resolve('FILLED') })).toBe(0);
    expect(db.executions.get('xgou:spot:unknown')).toMatchObject({ fillCount: 1, recoveryCount: 1 });
  });

  it('collects readiness from persisted runtime state and remains stable across restart', async () => {
    process.env.ENABLE_OPERATIONAL_ALERTS = 'true';
    const now = new Date();
    const persistent = {
      rolePolicy: { findMany: () => Promise.resolve([
        { role: 'DEFAULT_ADMIN_ROLE', principalType: 'MULTISIG', principalReference: 'multisig://admin', requiredApprovals: 2 },
        { role: 'TREASURY_ROLE', principalType: 'MPC', principalReference: 'mpc://treasury', requiredApprovals: 2 },
        { role: 'EXECUTOR_ROLE', principalType: 'SERVICE_IDENTITY', principalReference: 'service://executor', requiredApprovals: 1 },
      ]) },
      exchangeCredentialProfile: { findMany: () => Promise.resolve([{ credentialReference: 'vault://exchange/prod/spot', permissions: ['SPOT_TRADE'], expiresAt: new Date(now.getTime() + 60_000) }]) },
      reconciliationRun: { findFirst: () => Promise.resolve({ status: 'PASSED', finishedAt: new Date(now.getTime() - 1_000) }) },
      reconciliationDifference: { count: () => Promise.resolve(0) },
      productionReadinessEvidence: { findMany: () => Promise.resolve([]) },
    };
    const runtimeDb = new FakeRuntimeDb();
    const facade = Object.assign(runtimeDb, persistent);
    const prisma = { db: facade } as unknown as PrismaService;
    const build = () => new ProductionReadinessCollector(prisma, new ProductionReadinessService(), new RoleReadinessService(), new DatabaseGlobalTradingStateStore(prisma), new RuntimeAlertService());
    const first = await build().collect(now);
    const restarted = await build().collect(now);
    expect(first.status).toBe('FAIL');
    expect(first.checks.find((check) => check.name === 'TREASURY_ROLE')?.status).toBe('PASS');
    expect(first.checks.find((check) => check.name === 'EXCHANGE_CREDENTIAL_PERMISSION')?.status).toBe('PASS');
    expect(first.checks.find((check) => check.name === 'RECONCILIATION')?.status).toBe('PASS');
    expect(restarted.checks).toEqual(first.checks);
  });
});
