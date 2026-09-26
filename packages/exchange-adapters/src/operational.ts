import { Decimal } from 'decimal.js';

export interface ReferencePrice { readonly source: string; readonly price: string; readonly capturedAt: Date; }
export class ReferencePriceService {
  compare(primary: ReferencePrice, secondary: ReferencePrice, maxDeviationBps: string, now: Date, staleMs: number): { readonly healthy: boolean; readonly deviationBps: string; readonly reasons: readonly string[] } {
    const reasons: string[] = [];
    if (now.getTime() - primary.capturedAt.getTime() > staleMs || now.getTime() - secondary.capturedAt.getTime() > staleMs) reasons.push('STALE_PRICE');
    const deviation = new Decimal(primary.price).minus(secondary.price).abs().div(secondary.price).mul(10_000);
    if (deviation.gt(maxDeviationBps)) reasons.push('PRICE_SOURCE_DEVIATION');
    return { healthy: reasons.length === 0, deviationBps: deviation.toFixed(), reasons };
  }
}

export interface ExchangeHealthInput { readonly publicApi: boolean; readonly privateReadApi: boolean; readonly latencyMs: number; readonly errorRate: number; readonly timeDriftMs: number; }
export class ExchangeHealthService {
  evaluate(input: ExchangeHealthInput, limits = { maxLatencyMs: 2000, maxErrorRate: 0.05, maxTimeDriftMs: 1000 }): 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN' {
    if (!input.publicApi || !input.privateReadApi || input.timeDriftMs > limits.maxTimeDriftMs) return 'UNHEALTHY';
    if (input.latencyMs > limits.maxLatencyMs || input.errorRate > limits.maxErrorRate) return 'DEGRADED';
    return 'HEALTHY';
  }
}

export class ExchangeRateLimitManager {
  private usedWeight = 0;
  private cooldownUntil = 0;
  constructor(private readonly maximumWeight: number, private readonly cooldownMs: number) {}
  acquire(weight: number, now = Date.now()): boolean {
    if (now < this.cooldownUntil) return false;
    if (this.usedWeight + weight > this.maximumWeight) { this.cooldownUntil = now + this.cooldownMs; this.usedWeight = 0; return false; }
    this.usedWeight += weight;
    return true;
  }
  reset(): void { this.usedWeight = 0; this.cooldownUntil = 0; }
}

export interface ReconciliationSnapshot { readonly source: string; readonly internal: string; readonly external: string; readonly difference: string; readonly timestamp: Date; readonly sourceHealth: string; readonly referenceId: string; }
export interface ReconciliationAdapter { capture(): Promise<ReconciliationSnapshot>; }
export const classifyReconciliation = (snapshot: ReconciliationSnapshot, dust: string, critical: string): 'DUST' | 'WARNING' | 'CRITICAL' => {
  const difference = new Decimal(snapshot.difference).abs();
  if (difference.lte(dust)) return 'DUST';
  if (difference.gte(critical) || snapshot.sourceHealth !== 'HEALTHY') return 'CRITICAL';
  return 'WARNING';
};

export interface ExecutionPostingAdapter {
  postFill(input: object): Promise<void>;
  postFee(input: object): Promise<void>;
  postFunding(input: object): Promise<void>;
  postRealizedPnl(input: object): Promise<void>;
  postSettlementAdjustment(input: object): Promise<void>;
}
export class DryRunPostingAdapter implements ExecutionPostingAdapter {
  readonly postings: { readonly type: string; readonly input: object }[] = [];
  private post(type: string, input: object): Promise<void> { this.postings.push({ type, input }); return Promise.resolve(); }
  postFill(input: object): Promise<void> { return this.post('FILL', input); }
  postFee(input: object): Promise<void> { return this.post('FEE', input); }
  postFunding(input: object): Promise<void> { return this.post('FUNDING', input); }
  postRealizedPnl(input: object): Promise<void> { return this.post('REALIZED_PNL', input); }
  postSettlementAdjustment(input: object): Promise<void> { return this.post('SETTLEMENT_ADJUSTMENT', input); }
}

export interface OperationalRiskSnapshot { readonly exchangeHealth: string; readonly marketDataHealth: string; readonly keyProviderHealth: string; readonly reconciliationHealth: string; readonly unknownOrders: number; readonly errorRate: number; readonly globalState: string; readonly capturedAt: Date; }
export const evaluateOperationalRisk = (snapshot: OperationalRiskSnapshot, maxUnknownOrders: number, maxErrorRate: number): 'HEALTHY' | 'PAUSED' | 'EMERGENCY_STOP' => {
  if (snapshot.reconciliationHealth === 'CRITICAL' || snapshot.keyProviderHealth === 'UNHEALTHY') return 'EMERGENCY_STOP';
  if (snapshot.exchangeHealth !== 'HEALTHY' || snapshot.marketDataHealth !== 'HEALTHY' || snapshot.unknownOrders >= maxUnknownOrders || snapshot.errorRate >= maxErrorRate) return 'PAUSED';
  return 'HEALTHY';
};

export const planWorkerRecovery = (input: { readonly databaseAvailable: boolean; readonly redisAvailable: boolean }): 'RESUME_FROM_DATABASE' | 'REBUILD_REDIS_FROM_DATABASE' | 'BLOCKED_DATABASE_UNAVAILABLE' => {
  if (!input.databaseAvailable) return 'BLOCKED_DATABASE_UNAVAILABLE';
  return input.redisAvailable ? 'RESUME_FROM_DATABASE' : 'REBUILD_REDIS_FROM_DATABASE';
};
