import { Injectable } from '@nestjs/common';
import { BINANCE_FUTURES_TESTNET_BASE_URL, BINANCE_SPOT_TESTNET_BASE_URL, BinanceClientOrderIdCodec, assertBinanceSandboxGate } from '@xgou/exchange-adapters';
import { PrismaService } from '../database/prisma.service.js';
import { DatabaseGlobalTradingStateStore } from './database-global-trading-state.store.js';
import { Decimal } from 'decimal.js';

const CONTROL_ID = 'binance-testnet';

@Injectable()
export class BinanceSandboxService {
  constructor(private readonly prisma: PrismaService, private readonly globalState: DatabaseGlobalTradingStateStore) {}

  async readiness() {
    const [control, credentials, state, openIncidents, unknownOrders] = await Promise.all([
      this.prisma.db.sandboxTransportControl.findUnique({ where: { id: CONTROL_ID } }),
      this.prisma.db.exchangeCredentialProfile.findMany({ where: { exchange: 'BINANCE', environment: 'TESTNET', status: 'ACTIVE' }, select: { id: true, accountId: true, permissions: true, credentialReference: true, expiresAt: true } }),
      this.globalState.get(),
      this.prisma.db.incident.count({ where: { status: { not: 'RESOLVED' }, severity: { in: ['CRITICAL', 'EMERGENCY'] } } }),
      this.prisma.db.sandboxOrder.count({ where: { state: { in: ['UNKNOWN', 'RECONCILIATION_REQUIRED'] } } }),
    ]);
    const env = {
      executionMode: process.env.EXECUTION_MODE,
      transportEnabled: process.env.SANDBOX_EXCHANGE_TRANSPORT_ENABLED,
      environment: process.env.BINANCE_ENVIRONMENT,
    };
    let environmentGate = true;
    try { assertBinanceSandboxGate(env); } catch { environmentGate = false; }
    const sanitizedCredentials = credentials.map((profile) => ({
      id: profile.id,
      accountId: profile.accountId,
      permissions: profile.permissions,
      referenceConfigured: /^(kms|vault|custody):\/\//.test(profile.credentialReference),
      expired: Boolean(profile.expiresAt && profile.expiresAt <= new Date()),
    }));
    const credentialReady = sanitizedCredentials.some((profile) => profile.permissions.includes('READ') && profile.permissions.includes('SPOT_TRADE') && !profile.permissions.some((permission) => permission.includes('WITHDRAW')) && profile.referenceConfigured && !profile.expired)
      && sanitizedCredentials.some((profile) => profile.permissions.includes('READ') && profile.permissions.includes('FUTURES_TRADE') && !profile.permissions.some((permission) => permission.includes('WITHDRAW')) && profile.referenceConfigured && !profile.expired);
    return {
      phase: 'PHASE_6', exchange: 'BINANCE', environment: 'TESTNET', executionMode: process.env.EXECUTION_MODE ?? 'DRY_RUN',
      hosts: { spot: BINANCE_SPOT_TESTNET_BASE_URL, futures: BINANCE_FUTURES_TESTNET_BASE_URL },
      transport: { environmentGate, databaseEnabled: control?.enabled ?? false, approved: Boolean(control?.approvalRequestId), effective: environmentGate && Boolean(control?.enabled) },
      credentials: sanitizedCredentials,
      safety: {
        globalState: state, openCriticalIncidents: openIncidents, unknownOrders,
        mainnetEnabled: process.env.MAINNET_ENABLED === 'true', realTradingEnabled: process.env.REAL_TRADING_ENABLED === 'true',
        realWithdrawalsEnabled: process.env.REAL_WITHDRAWALS_ENABLED === 'true', realRewardDistributionEnabled: process.env.REAL_REWARD_DISTRIBUTION_ENABLED === 'true',
        productionTransportEnabled: process.env.LIVE_EXCHANGE_TRANSPORT_ENABLED === 'true',
      },
      ready: environmentGate && Boolean(control?.enabled) && credentialReady && state === 'ACTIVE' && openIncidents === 0 && unknownOrders === 0,
    };
  }

  async requestEnable(requestedBy: string) {
    const expiresAt = new Date(Date.now() + 30 * 60_000);
    return this.prisma.db.approvalRequest.create({ data: { actionType: 'ENABLE_BINANCE_SANDBOX_TRANSPORT', resourceType: 'SandboxTransportControl', resourceId: CONTROL_ID, requestedBy, requiredApprovals: 2, expiresAt } });
  }

  async enable(approvalRequestId: string, enabledBy: string) {
    assertBinanceSandboxGate({ executionMode: process.env.EXECUTION_MODE, transportEnabled: process.env.SANDBOX_EXCHANGE_TRANSPORT_ENABLED, environment: process.env.BINANCE_ENVIRONMENT });
    const approval = await this.prisma.db.approvalRequest.findUnique({ where: { id: approvalRequestId }, include: { approvals: true } });
    if (!approval || approval.actionType !== 'ENABLE_BINANCE_SANDBOX_TRANSPORT' || approval.resourceId !== CONTROL_ID || approval.status !== 'APPROVED' || approval.expiresAt <= new Date()) throw new Error('approved, unexpired Binance sandbox approval is required');
    if (approval.approvals.filter((row) => row.decision === 'APPROVE').length < approval.requiredApprovals) throw new Error('insufficient independent approvals');
    return this.prisma.db.$transaction(async (tx) => {
      const control = await tx.sandboxTransportControl.upsert({ where: { id: CONTROL_ID }, create: { id: CONTROL_ID, exchange: 'BINANCE', environment: 'TESTNET', enabled: true, approvalRequestId, enabledBy, enabledAt: new Date() }, update: { enabled: true, approvalRequestId, enabledBy, enabledAt: new Date(), disabledReason: null, version: { increment: 1 } } });
      await tx.approvalRequest.update({ where: { id: approvalRequestId }, data: { status: 'EXECUTED' } });
      await tx.auditLog.create({ data: { actorId: enabledBy, action: 'BINANCE_SANDBOX_TRANSPORT_ENABLED', target: CONTROL_ID, before: { enabled: false }, after: { enabled: true, approvalRequestId }, requestId: crypto.randomUUID() } });
      return control;
    });
  }

  async disable(reason: string, actorId: string) {
    const control = await this.prisma.db.sandboxTransportControl.upsert({ where: { id: CONTROL_ID }, create: { id: CONTROL_ID, exchange: 'BINANCE', environment: 'TESTNET', enabled: false, disabledReason: reason }, update: { enabled: false, disabledReason: reason, version: { increment: 1 } } });
    await this.prisma.db.auditLog.create({ data: { actorId, action: 'BINANCE_SANDBOX_TRANSPORT_DISABLED', target: CONTROL_ID, before: { enabled: true }, after: { enabled: false, reason }, requestId: crypto.randomUUID() } });
    return control;
  }

  async emergencyStop(reason: string, actorId: string) {
    await Promise.all([this.disable(reason, actorId), this.globalState.set('EMERGENCY_STOP', false, reason, actorId)]);
    return { state: 'EMERGENCY_STOP', transportEnabled: false };
  }

  orders() { return this.prisma.db.sandboxOrder.findMany({ include: { fills: true, protectiveOrders: true }, orderBy: { createdAt: 'desc' }, take: 100 }); }
  reconciliation() { return this.prisma.db.sandboxReconciliationRun.findMany({ include: { differences: true }, orderBy: { startedAt: 'desc' }, take: 50 }); }
  async recoverable() { return { count: await this.prisma.db.sandboxOrder.count({ where: { state: { in: ['UNKNOWN', 'RECONCILIATION_REQUIRED', 'SUBMITTING', 'SUBMITTED'] } } }) }; }

  async reserveOrder(input: { proposalId: string; riskDecisionId: string; authorizationId: string; strategyAccountId?: string; strategy: string; cycle: string; accountType: 'SPOT' | 'FUTURES'; symbol: string; side: string; type: string; quantity: string; price?: string; stopPrice?: string; reduceOnly?: boolean; leverage?: number }) {
    const readiness = await this.readiness();
    if (!readiness.ready) throw new Error('Binance sandbox readiness gate is not satisfied');
    const authorization = await this.prisma.db.executionAuthorization.findUnique({ where: { id: input.authorizationId } });
    if (!authorization || authorization.executionMode !== 'SANDBOX' || authorization.environment !== 'TESTNET' || authorization.proposalId !== input.proposalId || authorization.riskDecisionId !== input.riskDecisionId || authorization.expiresAt <= new Date()) throw new Error('fresh SANDBOX/TESTNET authorization is required');
    if (input.accountType === 'FUTURES' && !input.reduceOnly && (!input.stopPrice || (input.leverage ?? 1) > 2)) throw new Error('futures sandbox opening orders require stop and leverage <=2x');
    const now = new Date();
    const [riskDecision, minuteOrders, hourOrders, dailyOrders] = await Promise.all([
      this.prisma.db.riskDecision.findUnique({ where: { id: input.riskDecisionId }, select: { approvedNotional: true } }),
      this.prisma.db.sandboxOrder.count({ where: { createdAt: { gte: new Date(now.getTime() - 60_000) } } }),
      this.prisma.db.sandboxOrder.count({ where: { createdAt: { gte: new Date(now.getTime() - 3_600_000) } } }),
      this.prisma.db.sandboxOrder.findMany({ where: { createdAt: { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) } }, select: { riskDecisionId: true } }),
    ]);
    if (!riskDecision) throw new Error('sandbox risk decision not found');
    const maxPerOrder = new Decimal(process.env.BINANCE_SANDBOX_MAX_ORDER_NOTIONAL ?? '100');
    const maxDaily = new Decimal(process.env.BINANCE_SANDBOX_DAILY_NOTIONAL_LIMIT ?? '1000');
    const maxPerMinute = Number(process.env.BINANCE_SANDBOX_MAX_ORDERS_PER_MINUTE ?? 5);
    const maxPerHour = Number(process.env.BINANCE_SANDBOX_MAX_ORDERS_PER_HOUR ?? 20);
    if (!input.reduceOnly && new Decimal(riskDecision.approvedNotional.toString()).gt(maxPerOrder)) throw new Error('sandbox per-order notional limit exceeded');
    if (minuteOrders >= maxPerMinute || hourOrders >= maxPerHour) throw new Error('sandbox order velocity limit exceeded');
    if (!input.reduceOnly && dailyOrders.length > 0) {
      const decisions = await this.prisma.db.riskDecision.findMany({ where: { id: { in: dailyOrders.map((order) => order.riskDecisionId) } }, select: { approvedNotional: true } });
      const used = decisions.reduce((sum, decision) => sum.plus(decision.approvedNotional.toString()), new Decimal(0));
      if (used.plus(riskDecision.approvedNotional.toString()).gt(maxDaily)) throw new Error('sandbox daily notional limit exceeded');
    }
    const internalClientOrderId = `${input.strategy}:${input.cycle}:${input.proposalId}`;
    const exchangeClientOrderId = new BinanceClientOrderIdCodec().encode({ strategy: input.strategy, cycle: input.cycle, proposalId: input.proposalId });
    const prior = await this.prisma.db.sandboxOrder.findFirst({ where: { OR: [{ internalClientOrderId }, { exchangeClientOrderId }] } });
    if (prior) return prior;
    return this.prisma.db.sandboxOrder.create({ data: { proposalId: input.proposalId, riskDecisionId: input.riskDecisionId, authorizationId: input.authorizationId, ...(input.strategyAccountId ? { strategyAccountId: input.strategyAccountId } : {}), internalClientOrderId, exchangeClientOrderId, accountType: input.accountType, symbol: input.symbol, side: input.side, type: input.type, quantity: input.quantity, ...(input.price ? { price: input.price } : {}), ...(input.stopPrice ? { stopPrice: input.stopPrice } : {}), reduceOnly: input.reduceOnly ?? false, ...(input.leverage ? { leverage: input.leverage } : {}), state: 'AUTHORIZED', networkSent: false, ledgerEntries: { create: { eventType: 'ORDER_RESERVED', stateAfter: 'AUTHORIZED', details: { mode: 'SANDBOX', environment: 'TESTNET' } } } } });
  }
}
