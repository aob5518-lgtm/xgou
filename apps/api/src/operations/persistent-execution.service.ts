import { Injectable } from '@nestjs/common';
import { ExecutionPolicyService, type ExecutionMode, type RiskCheckResult, type SerializedOrder } from '@xgou/exchange-adapters';
import { PrismaService } from '../database/prisma.service.js';
import { DatabaseGlobalTradingStateStore } from './database-global-trading-state.store.js';

export interface CreateExecutionAuthorizationInput {
  readonly proposalId: string;
  readonly riskDecisionId: string;
  readonly executionMode: ExecutionMode;
  readonly environment: 'DEVELOPMENT' | 'TESTNET' | 'PRODUCTION';
  readonly authorizedBy: string;
  readonly referencePrice: string;
  readonly maxPriceDeviationBps: string;
  readonly now?: Date;
}

export interface PersistDryRunInput {
  readonly authorizationId: string;
  readonly order: SerializedOrder;
  readonly exchange: string;
  readonly credentialProfileId: string;
  readonly now?: Date;
  readonly freshPrice: string;
  readonly availableBalance: string;
  readonly currentExposure: string;
  readonly maxExposure: string;
  readonly exchangeHealth: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN';
  readonly marketDataHealthy: boolean;
  readonly credentialHealthy: boolean;
  readonly unknownOrders: number;
  readonly maxUnknownOrders: number;
}

@Injectable()
export class PersistentExecutionService {
  private readonly policy: ExecutionPolicyService;
  constructor(private readonly prisma: PrismaService, private readonly states: DatabaseGlobalTradingStateStore) {
    this.policy = new ExecutionPolicyService(this.states);
  }

  async authorize(input: CreateExecutionAuthorizationInput) {
    if (input.executionMode === 'LIVE') throw new Error('Live execution is not enabled in Phase 6.');
    if (input.executionMode === 'SANDBOX' && input.environment !== 'TESTNET') throw new Error('SANDBOX authorization requires TESTNET environment');
    const now = input.now ?? new Date();
    const [proposal, riskDecision, globalTradingState] = await Promise.all([
      this.prisma.db.tradeProposal.findUnique({ where: { id: input.proposalId } }),
      this.prisma.db.riskDecision.findUnique({ where: { id: input.riskDecisionId } }),
      this.states.get(),
    ]);
    if (!proposal || !riskDecision || riskDecision.proposalId !== proposal.id) throw new Error('proposal and risk decision must be persisted and linked');
    if (!['APPROVED', 'REDUCED'].includes(riskDecision.decision)) throw new Error('persisted risk decision rejected execution');
    return this.prisma.db.executionAuthorization.create({
      data: {
        proposalId: proposal.id,
        riskDecisionId: riskDecision.id,
        executionMode: input.executionMode,
        environment: input.environment,
        policyStatus: 'APPROVED',
        riskStatus: 'APPROVED',
        globalTradingState,
        authorizedBy: input.authorizedBy,
        referencePrice: input.referencePrice,
        maxPriceDeviationBps: input.maxPriceDeviationBps,
        expiresAt: new Date(now.getTime() + 30_000),
        createdAt: now,
      },
    });
  }

  async executeDryRun(input: PersistDryRunInput) {
    const prior = await this.prisma.db.dryRunExecution.findUnique({ where: { clientOrderId: input.order.clientOrderId } });
    if (prior) return prior;
    const now = input.now ?? new Date();
    const [authorization, credential] = await Promise.all([
      this.prisma.db.executionAuthorization.findUnique({ where: { id: input.authorizationId } }),
      this.prisma.db.exchangeCredentialProfile.findUnique({ where: { id: input.credentialProfileId } }),
    ]);
    if (!authorization) throw new Error('persisted execution authorization is required');
    if (authorization.executionMode !== 'DRY_RUN') throw new Error('dry-run execution requires DRY_RUN authorization');
    if (authorization.proposalId !== input.order.proposalId) throw new Error('authorization proposal mismatch');
    if (!credential || credential.status !== 'ACTIVE' || (credential.expiresAt && credential.expiresAt <= now)) throw new Error('active credential reference is required');
    if (!/^(kms|vault|custody):\/\//.test(credential.credentialReference)) throw new Error('credential must use an opaque secret reference');
    if (!credential.permissions.some((permission) => ['SPOT_TRADE', 'FUTURES_TRADE'].includes(permission)) || credential.permissions.some((permission) => permission.includes('WITHDRAW'))) throw new Error('credential must be trade-only');

    const risk: RiskCheckResult = await this.policy.check({
      now,
      authorization: {
        proposalId: authorization.proposalId,
        riskDecisionId: authorization.riskDecisionId,
        executionMode: authorization.executionMode,
        environment: authorization.environment,
        policyStatus: authorization.policyStatus as 'APPROVED' | 'REJECTED',
        riskStatus: authorization.riskStatus as 'APPROVED' | 'REJECTED',
        globalTradingState: authorization.globalTradingState,
        authorizedBy: authorization.authorizedBy,
        referencePrice: authorization.referencePrice.toFixed(),
        maxPriceDeviationBps: authorization.maxPriceDeviationBps.toFixed(),
        expiresAt: authorization.expiresAt,
        createdAt: authorization.createdAt,
      },
      order: input.order,
      freshPrice: input.freshPrice,
      availableBalance: input.availableBalance,
      currentExposure: input.currentExposure,
      maxExposure: input.maxExposure,
      exchangeHealth: input.exchangeHealth,
      marketDataHealthy: input.marketDataHealthy,
      credentialHealthy: input.credentialHealthy,
      unknownOrders: input.unknownOrders,
      maxUnknownOrders: input.maxUnknownOrders,
    });
    if (!risk.approved) throw new Error(`pre-trade execution risk rejected: ${risk.reasons.join(',')}`);

    try {
      return await this.prisma.db.dryRunExecution.create({
        data: {
          proposalId: authorization.proposalId,
          riskDecisionId: authorization.riskDecisionId,
          authorizationId: authorization.id,
          clientOrderId: input.order.clientOrderId,
          exchange: input.exchange,
          symbol: input.order.symbol,
          side: input.order.side,
          type: input.order.type,
          quantity: input.order.quantity,
          ...(input.order.price === undefined ? {} : { price: input.order.price }),
          reduceOnly: input.order.reduceOnly,
          timeInForce: input.order.timeInForce,
          ...(input.order.leverage === undefined ? {} : { leverage: input.order.leverage }),
          credentialProfileId: credential.id,
          policyDecision: { status: 'APPROVED', latestGlobalStateChecked: true },
          riskDecision: { approved: risk.approved, reasons: [...risk.reasons] },
          state: 'ACKNOWLEDGED',
          networkSent: false,
          createdAt: now,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      const concurrent = await this.prisma.db.dryRunExecution.findUnique({ where: { clientOrderId: input.order.clientOrderId } });
      if (!concurrent) throw error;
      return concurrent;
    }
  }
}

export interface PersistentOrderQuery {
  query(clientOrderId: string): Promise<'FILLED' | 'CANCELLED' | 'REJECTED' | 'ACKNOWLEDGED' | null>;
}

@Injectable()
export class PersistentOrderRecoveryWorker {
  constructor(private readonly prisma: PrismaService) {}

  async recoverUnknown(query: PersistentOrderQuery): Promise<number> {
    const unknown = await this.prisma.db.dryRunExecution.findMany({ where: { state: 'UNKNOWN' }, orderBy: { createdAt: 'asc' } });
    let recovered = 0;
    for (const execution of unknown) {
      const queried = await query.query(execution.clientOrderId);
      const state = queried ?? 'RECONCILIATION_REQUIRED';
      await this.prisma.db.$transaction(async (tx) => {
        const update = await tx.dryRunExecution.updateMany({
          where: { id: execution.id, state: 'UNKNOWN' },
          data: {
            state,
            ...(queried === 'FILLED' ? { fillCount: { increment: 1 } } : {}),
            recoveryCount: { increment: 1 },
            recoveredAt: new Date(),
          },
        });
        if (update.count === 1) {
          recovered += 1;
          await tx.auditLog.create({
            data: {
              action: 'UNKNOWN_ORDER_RECOVERED',
              target: `DryRunExecution:${execution.id}`,
              before: { state: 'UNKNOWN' },
              after: { state, clientOrderId: execution.clientOrderId },
              requestId: crypto.randomUUID(),
            },
          });
        }
      });
    }
    return recovered;
  }
}
