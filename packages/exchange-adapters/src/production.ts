import { Decimal } from 'decimal.js';
import type { CredentialHandle } from '@xgou/key-management';
import { assertTradeOnlyCredential } from '@xgou/key-management';
import type { AlertSink, MetricSink } from '@xgou/observability';

export type ExecutionMode = 'PAPER' | 'DRY_RUN' | 'SANDBOX' | 'LIVE';
export type GlobalTradingState = 'ACTIVE' | 'REDUCE_ONLY' | 'PAUSED' | 'EMERGENCY_STOP';
export type ExecutionState = 'AUTHORIZED' | 'SUBMITTING' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCEL_REQUESTED' | 'CANCELLED' | 'REJECTED' | 'UNKNOWN' | 'RECONCILIATION_REQUIRED';
export type ExecutionSide = 'BUY' | 'SELL' | 'OPEN_LONG' | 'OPEN_SHORT' | 'REDUCE_LONG' | 'REDUCE_SHORT' | 'CLOSE_LONG' | 'CLOSE_SHORT';

export interface ExchangeCapabilities {
  readonly spotSupported: boolean;
  readonly futuresSupported: boolean;
  readonly maxLeverage: string;
  readonly reduceOnlySupported: boolean;
  readonly clientOrderIdSupported: boolean;
  readonly positionMode: 'ONE_WAY' | 'HEDGE';
  readonly supportedPairs: readonly string[];
  readonly minNotional: string;
  readonly stepSize: string;
  readonly tickSize: string;
}

export interface InternalOrder {
  readonly strategy: string;
  readonly cycle: string;
  readonly proposalId: string;
  readonly symbol: string;
  readonly side: ExecutionSide;
  readonly type: 'MARKET' | 'LIMIT';
  readonly quantity: string;
  readonly price?: string;
  readonly reduceOnly: boolean;
  readonly timeInForce: 'GTC' | 'IOC' | 'FOK';
  readonly leverage?: string;
  readonly stopPrice?: string;
}

export interface SerializedOrder extends InternalOrder { readonly exchangeSymbol: string; readonly clientOrderId: string; }

export class ExchangeOrderMapper {
  constructor(private readonly symbols: Readonly<Record<string, string>>, private readonly capabilities: ExchangeCapabilities) {}
  map(order: InternalOrder): SerializedOrder {
    const exchangeSymbol = this.symbols[order.symbol];
    if (!exchangeSymbol || !this.capabilities.supportedPairs.includes(order.symbol)) throw new Error('unsupported exchange symbol');
    if (!this.capabilities.clientOrderIdSupported) throw new Error('client order id is required');
    if (order.reduceOnly && !this.capabilities.reduceOnlySupported) throw new Error('reduce-only is not supported');
    if (new Decimal(order.quantity).lte(0)) throw new Error('order quantity must be positive');
    if (order.leverage && new Decimal(order.leverage).gt(this.capabilities.maxLeverage)) throw new Error('leverage exceeds exchange capability');
    if (['OPEN_LONG', 'OPEN_SHORT'].includes(order.side) && (!order.stopPrice || new Decimal(order.stopPrice).lte(0))) throw new Error('futures opening orders require a stop price');
    return { ...order, exchangeSymbol, clientOrderId: `xgou:${order.strategy}:${order.cycle}:${order.proposalId}` };
  }
}

export interface ExecutionAuthorization {
  readonly proposalId: string;
  readonly riskDecisionId: string;
  readonly executionMode: ExecutionMode;
  readonly environment: string;
  readonly policyStatus: 'APPROVED' | 'REJECTED';
  readonly riskStatus: 'APPROVED' | 'REJECTED';
  readonly globalTradingState: GlobalTradingState;
  readonly authorizedBy: string;
  readonly referencePrice: string;
  readonly maxPriceDeviationBps: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export const authorizeExecution = (input: Omit<ExecutionAuthorization, 'expiresAt' | 'createdAt'>, now: Date, ttlSeconds = 30): ExecutionAuthorization => {
  if (input.executionMode === 'LIVE') throw new Error('Live execution is not enabled in Phase 5.');
  if (input.policyStatus !== 'APPROVED' || input.riskStatus !== 'APPROVED') throw new Error('execution policy and risk must approve');
  return { ...input, createdAt: now, expiresAt: new Date(now.getTime() + ttlSeconds * 1000) };
};

const increasesExposure = (side: ExecutionSide): boolean => ['BUY', 'OPEN_LONG', 'OPEN_SHORT'].includes(side);

export interface PreTradeRiskInput {
  readonly now: Date;
  readonly authorization: ExecutionAuthorization;
  readonly order: SerializedOrder;
  readonly freshPrice: string;
  readonly availableBalance: string;
  readonly currentExposure: string;
  readonly maxExposure: string;
  readonly globalState: GlobalTradingState;
  readonly exchangeHealth: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN';
  readonly marketDataHealthy: boolean;
  readonly credentialHealthy: boolean;
  readonly unknownOrders: number;
  readonly maxUnknownOrders: number;
}

export interface RiskCheckResult { readonly approved: boolean; readonly reasons: readonly string[]; }
export const checkPreTradeRisk = (input: PreTradeRiskInput): RiskCheckResult => {
  const reasons: string[] = [];
  if (input.now >= input.authorization.expiresAt) reasons.push('AUTHORIZATION_EXPIRED');
  const deviation = new Decimal(input.freshPrice).minus(input.authorization.referencePrice).abs().div(input.authorization.referencePrice).mul(10_000);
  if (deviation.gt(input.authorization.maxPriceDeviationBps)) reasons.push('PRICE_DEVIATION');
  if (input.globalState === 'PAUSED' && increasesExposure(input.order.side)) reasons.push('GLOBAL_PAUSED');
  if (['REDUCE_ONLY', 'EMERGENCY_STOP'].includes(input.globalState) && increasesExposure(input.order.side)) reasons.push('GLOBAL_REDUCE_ONLY');
  if (input.exchangeHealth !== 'HEALTHY') reasons.push('EXCHANGE_UNHEALTHY');
  if (!input.marketDataHealthy) reasons.push('MARKET_DATA_UNHEALTHY');
  if (!input.credentialHealthy) reasons.push('CREDENTIAL_UNHEALTHY');
  if (input.unknownOrders >= input.maxUnknownOrders) reasons.push('UNKNOWN_ORDER_LIMIT');
  const notional = new Decimal(input.order.quantity).mul(input.freshPrice);
  if (notional.gt(input.availableBalance)) reasons.push('INSUFFICIENT_BALANCE');
  if (increasesExposure(input.order.side) && new Decimal(input.currentExposure).plus(notional).gt(input.maxExposure)) reasons.push('EXPOSURE_LIMIT');
  return { approved: reasons.length === 0, reasons };
};

export interface DryRunExecution {
  readonly exchange: string;
  readonly order: SerializedOrder;
  readonly credentialProfile: string;
  readonly policyDecision: 'APPROVED';
  readonly riskDecision: RiskCheckResult;
  readonly state: 'ACKNOWLEDGED';
  readonly networkSent: false;
  readonly createdAt: Date;
}

export class LiveSpotExchangeAdapter {
  constructor(private readonly transportEnabled = process.env.LIVE_EXCHANGE_TRANSPORT_ENABLED === 'true') {
    if (this.transportEnabled) throw new Error('Live exchange transport is not enabled in Phase 5.');
  }
  submit(): never { throw new Error('Live execution is not enabled in Phase 5.'); }
}
export class LivePerpExchangeAdapter extends LiveSpotExchangeAdapter {}

export class DryRunExchangeAdapter {
  private readonly executions = new Map<string, DryRunExecution>();
  constructor(private readonly exchange: string, private readonly metrics?: MetricSink) {}
  execute(order: SerializedOrder, authorization: ExecutionAuthorization, risk: RiskCheckResult, credential: CredentialHandle, now = new Date()): DryRunExecution {
    if (authorization.executionMode !== 'DRY_RUN') throw new Error('dry-run adapter requires DRY_RUN authorization');
    if (!risk.approved) throw new Error('pre-trade execution risk rejected');
    assertTradeOnlyCredential(credential.metadata);
    const prior = this.executions.get(order.clientOrderId);
    if (prior) return prior;
    const execution: DryRunExecution = { exchange: this.exchange, order, credentialProfile: credential.reference, policyDecision: 'APPROVED', riskDecision: risk, state: 'ACKNOWLEDGED', networkSent: false, createdAt: now };
    this.executions.set(order.clientOrderId, execution);
    this.metrics?.record('xgou_orders_total', 1, { mode: 'DRY_RUN', exchange: this.exchange });
    return execution;
  }
}

export interface RecoverableOrder { readonly clientOrderId: string; state: ExecutionState; fills: number; }
export interface OrderQuery { query(clientOrderId: string): Promise<'FILLED' | 'CANCELLED' | 'REJECTED' | 'ACKNOWLEDGED' | null>; }
export class OrderRecoveryWorker {
  async recover(order: RecoverableOrder, query: OrderQuery): Promise<RecoverableOrder> {
    if (order.state !== 'UNKNOWN') return order;
    const result = await query.query(order.clientOrderId);
    if (!result) return order;
    order.state = result;
    if (result === 'FILLED' && order.fills === 0) order.fills = 1;
    return order;
  }
}

export interface ExecutionLimitPolicy {
  readonly perTradeLimit: string;
  readonly perAssetDailyLimit: string;
  readonly perStrategyDailyLimit: string;
  readonly perTreasuryDailyLimit: string;
  readonly globalDailyLimit: string;
  readonly maxOrdersPerMinute: number;
  readonly maxOrdersPerHour: number;
  readonly maxNotionalPerMinute: string;
  readonly maxNotionalPerHour: string;
}

export class ExecutionAnomalyDetector {
  evaluate(input: { readonly orderNotional: string; readonly recentAverageNotional: string; readonly priceDeviationBps: string; readonly frequencyPerMinute: number; readonly allowedSymbol: boolean }, policy: ExecutionLimitPolicy): { readonly severity: 'OK' | 'WARN' | 'BLOCK' | 'EMERGENCY_STOP'; readonly reasons: readonly string[] } {
    const reasons: string[] = [];
    if (!input.allowedSymbol) reasons.push('UNEXPECTED_SYMBOL');
    if (new Decimal(input.orderNotional).gt(policy.perTradeLimit)) reasons.push('PER_TRADE_LIMIT');
    if (input.frequencyPerMinute > policy.maxOrdersPerMinute) reasons.push('ORDER_VELOCITY');
    if (new Decimal(input.recentAverageNotional).gt(0) && new Decimal(input.orderNotional).gt(new Decimal(input.recentAverageNotional).mul(5))) reasons.push('ORDER_SIZE_SPIKE');
    if (new Decimal(input.priceDeviationBps).gt(500)) reasons.push('PRICE_DEVIATION');
    return { severity: reasons.includes('UNEXPECTED_SYMBOL') ? 'EMERGENCY_STOP' : reasons.length ? 'BLOCK' : 'OK', reasons };
  }
}

export interface GlobalTradingStateStore { get(): GlobalTradingState; set(state: GlobalTradingState, manual: boolean): void; }
export class InMemoryGlobalTradingStateStore implements GlobalTradingStateStore {
  private state: GlobalTradingState = 'ACTIVE';
  private emergency = false;
  get(): GlobalTradingState { return this.state; }
  set(state: GlobalTradingState, manual: boolean): void {
    if (this.emergency && state === 'ACTIVE' && !manual) throw new Error('EMERGENCY_STOP requires manual resume');
    this.state = state;
    this.emergency = state === 'EMERGENCY_STOP';
  }
}

export class OperationalRiskController {
  constructor(private readonly states: GlobalTradingStateStore, private readonly alerts: AlertSink) {}
  async critical(type: string, summary: string): Promise<void> {
    this.states.set('EMERGENCY_STOP', false);
    await this.alerts.emit({ type, severity: 'EMERGENCY', summary, createdAt: new Date() });
  }
}

export interface ExecutionAuditEvent { readonly type: 'SIGNAL' | 'PROPOSAL' | 'RISK_DECISION' | 'EXECUTION_AUTHORIZATION' | 'DRY_RUN_EXECUTION' | 'AUDIT'; readonly reference: string; }
export const buildExecutionAuditTrail = (input: { readonly signalId: string; readonly proposalId: string; readonly riskDecisionId: string; readonly authorizationId: string; readonly executionId: string; readonly auditId: string }): readonly ExecutionAuditEvent[] => [
  { type: 'SIGNAL', reference: input.signalId },
  { type: 'PROPOSAL', reference: input.proposalId },
  { type: 'RISK_DECISION', reference: input.riskDecisionId },
  { type: 'EXECUTION_AUTHORIZATION', reference: input.authorizationId },
  { type: 'DRY_RUN_EXECUTION', reference: input.executionId },
  { type: 'AUDIT', reference: input.auditId },
];
