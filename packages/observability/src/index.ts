export const METRICS = [
  'xgou_orders_total', 'xgou_orders_failed', 'xgou_unknown_orders', 'xgou_order_latency_ms',
  'xgou_risk_rejections', 'xgou_kill_switch_state', 'xgou_reconciliation_difference',
  'xgou_market_data_staleness', 'xgou_exchange_health', 'xgou_key_provider_health',
  'xgou_reward_settlement_failures',
] as const;
export type MetricName = typeof METRICS[number];

const REDACTED = '[REDACTED]';
const sensitive = /authorization|cookie|private.?key|secret|api.?key|signature|mnemonic|refresh.?token|access.?token/i;
const bearer = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const hexKey = /\b(?:0x)?[a-fA-F0-9]{64}\b/g;

export const redactSecrets = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (typeof value === 'string') return value.replace(bearer, `Bearer ${REDACTED}`).replace(hexKey, REDACTED);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, seen));
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sensitive.test(key) ? REDACTED : redactSecrets(entry, seen)]));
};

export interface StructuredLog {
  readonly requestId: string;
  readonly severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';
  readonly event: string;
  readonly userId?: string;
  readonly strategyId?: string;
  readonly cycleId?: string;
  readonly proposalId?: string;
  readonly orderId?: string;
  readonly chainId?: string;
  readonly exchange?: string;
  readonly details?: unknown;
}

export const structuredLog = (event: StructuredLog): string => JSON.stringify(redactSecrets(event));

export interface MetricSink { record(name: MetricName, value: number, labels?: Readonly<Record<string, string>>): void; }
export class InMemoryMetricSink implements MetricSink {
  readonly values: { readonly name: MetricName; readonly value: number; readonly labels?: Readonly<Record<string, string>> }[] = [];
  record(name: MetricName, value: number, labels?: Readonly<Record<string, string>>): void {
    this.values.push(labels ? { name, value, labels } : { name, value });
  }
}

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';
export interface AlertEvent { readonly type: string; readonly severity: AlertSeverity; readonly summary: string; readonly details?: unknown; readonly createdAt: Date; }
export interface AlertSink { emit(event: AlertEvent): Promise<void>; }
export class MemoryAlertSink implements AlertSink {
  readonly events: AlertEvent[] = [];
  emit(event: AlertEvent): Promise<void> { this.events.push({ ...event, details: redactSecrets(event.details) }); return Promise.resolve(); }
}

export interface IncidentRecord { readonly id: string; readonly severity: 'CRITICAL' | 'EMERGENCY'; readonly type: string; readonly status: 'OPEN'; readonly summary: string; readonly details: unknown; readonly detectedAt: Date; }
export class IncidentCoordinator {
  readonly incidents: IncidentRecord[] = [];
  constructor(private readonly alerts: AlertSink) {}
  async handle(event: AlertEvent): Promise<IncidentRecord | null> {
    await this.alerts.emit(event);
    if (!['CRITICAL', 'EMERGENCY'].includes(event.severity)) return null;
    const incident: IncidentRecord = { id: `incident-${String(this.incidents.length + 1)}`, severity: event.severity as 'CRITICAL' | 'EMERGENCY', type: event.type, status: 'OPEN', summary: event.summary, details: redactSecrets(event.details), detectedAt: event.createdAt };
    this.incidents.push(incident);
    return incident;
  }
}
