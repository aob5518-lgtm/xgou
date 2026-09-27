import { Injectable } from '@nestjs/common';
import type { AlertEvent, AlertSink } from '@xgou/observability';
import { redactSecrets } from '@xgou/observability';

@Injectable()
export class RuntimeAlertService implements AlertSink {
  private readonly registration: { readonly registered: boolean } = { registered: true };
  healthCheck(): Promise<boolean> {
    return Promise.resolve(this.registration.registered && process.env.ENABLE_OPERATIONAL_ALERTS === 'true');
  }
  emit(event: AlertEvent): Promise<void> {
    // Phase 5 deliberately has no external paging transport. The event remains redacted.
    void redactSecrets(event);
    return Promise.resolve();
  }
}
