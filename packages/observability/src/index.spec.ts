import { describe, expect, it } from 'vitest';
import { IncidentCoordinator, InMemoryMetricSink, MemoryAlertSink, redactSecrets, structuredLog } from './index.js';

describe('observability safety', () => {
  it('redacts nested credentials, tokens, signatures and raw key-shaped strings', () => {
    const redacted = redactSecrets({ authorization: 'Bearer abc', nested: { apiKey: 'abc', harmless: `0x${'a'.repeat(64)}` } });
    expect(JSON.stringify(redacted)).not.toContain('Bearer abc');
    expect(JSON.stringify(redacted)).not.toContain('a'.repeat(64));
  });
  it('emits structured JSON without secrets', () => {
    expect(structuredLog({ requestId: 'r1', severity: 'INFO', event: 'TEST', details: { cookie: 'bad' } })).toContain('[REDACTED]');
  });
  it('records metrics and redacted critical alerts', async () => {
    const metrics = new InMemoryMetricSink();
    metrics.record('xgou_unknown_orders', 1);
    expect(metrics.values).toHaveLength(1);
    const alerts = new MemoryAlertSink();
    await alerts.emit({ type: 'KEY_PROVIDER_FAILURE', severity: 'CRITICAL', summary: 'failed', details: { privateKey: 'bad' }, createdAt: new Date() });
    expect(JSON.stringify(alerts.events)).not.toContain('"bad"');
  });
  it('creates an incident for a credential health failure', async () => {
    const alerts = new MemoryAlertSink();
    const incidents = new IncidentCoordinator(alerts);
    const incident = await incidents.handle({ type: 'KEY_PROVIDER_FAILURE', severity: 'CRITICAL', summary: 'credential unavailable', createdAt: new Date() });
    expect(incident).toMatchObject({ type: 'KEY_PROVIDER_FAILURE', status: 'OPEN' });
    expect(alerts.events).toHaveLength(1);
  });
});
