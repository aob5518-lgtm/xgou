import { Injectable } from '@nestjs/common';
import { DatabaseGlobalTradingStateStore } from './database-global-trading-state.store.js';
import { RuntimeAlertService } from './runtime-alert.service.js';

@Injectable()
export class PersistentOperationalRiskService {
  constructor(private readonly states: DatabaseGlobalTradingStateStore, private readonly alerts: RuntimeAlertService) {}

  async criticalReconciliation(summary: string, actorId = 'reconciliation-worker', requestId: string = crypto.randomUUID()): Promise<void> {
    await this.states.set('EMERGENCY_STOP', false, summary, actorId, requestId);
    await this.alerts.emit({ type: 'RECONCILIATION_CRITICAL', severity: 'EMERGENCY', summary, createdAt: new Date() });
  }
}
