import { Injectable } from '@nestjs/common';
import type { ProductionReadiness } from './readiness.js';
import { DatabaseGlobalTradingStateStore } from './database-global-trading-state.store.js';
import { ProductionReadinessCollector } from './production-readiness.collector.js';

export type ApiGlobalState = 'ACTIVE' | 'REDUCE_ONLY' | 'PAUSED' | 'EMERGENCY_STOP';

@Injectable()
export class OperationsService {
  constructor(private readonly states: DatabaseGlobalTradingStateStore, private readonly readiness: ProductionReadinessCollector) {}

  productionReadiness(): Promise<ProductionReadiness> {
    return this.readiness.collect();
  }

  globalState() {
    return this.states.read();
  }

  async transition(state: ApiGlobalState, actorId: string, requestId: string, manual = false): Promise<{ readonly state: ApiGlobalState }> {
    await this.states.set(state, manual, manual ? 'AUTHORIZED_MANUAL_RESUME' : `OPERATOR_${state}`, actorId, requestId);
    return { state: await this.states.get() };
  }
}
