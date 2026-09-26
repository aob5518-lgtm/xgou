import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { ProductionReadinessService, type ProductionReadiness } from './readiness.js';

export type ApiGlobalState = 'ACTIVE' | 'REDUCE_ONLY' | 'PAUSED' | 'EMERGENCY_STOP';

@Injectable()
export class OperationsService {
  private state: ApiGlobalState = 'ACTIVE';
  private emergency = false;
  constructor(private readonly prisma: PrismaService, private readonly readiness: ProductionReadinessService) {}

  productionReadiness(): ProductionReadiness {
    return this.readiness.evaluate({
      mainnetEnabled: process.env.MAINNET_ENABLED === 'true', realTradingEnabled: process.env.REAL_TRADING_ENABLED === 'true', realWithdrawalsEnabled: process.env.REAL_WITHDRAWALS_ENABLED === 'true',
      keyProvider: (process.env.KEY_PROVIDER ?? 'disabled') as 'disabled', treasuryRoleSecure: false, multisigConfigured: false, credentialTradeOnly: false,
      reconciliationHealthy: process.env.RECONCILIATION_ENABLED === 'true', killSwitchReady: true, alertingReady: process.env.ENABLE_OPERATIONAL_ALERTS === 'true', auditReady: true,
      rateLimitReady: true, backupVerified: false, incidentRunbookReady: true, securityAuditComplete: false, roleConcentration: true,
    });
  }

  async transition(state: ApiGlobalState, actorId: string, requestId: string): Promise<{ readonly state: ApiGlobalState }> {
    if (this.emergency && state === 'ACTIVE') this.emergency = false;
    this.state = state;
    this.emergency = state === 'EMERGENCY_STOP';
    await this.prisma.db.auditLog.create({ data: { actorId, action: `GLOBAL_TRADING_${state}`, target: 'GlobalTradingState', after: { state }, requestId } });
    if (state === 'EMERGENCY_STOP') await this.prisma.db.incident.create({ data: { severity: 'EMERGENCY', type: 'GLOBAL_EMERGENCY_STOP', summary: 'Global emergency stop activated', details: { state, actorId }, linkedRiskEvents: [] } });
    return { state: this.state };
  }
}
