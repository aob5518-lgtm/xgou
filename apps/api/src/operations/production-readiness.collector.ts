import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { DatabaseGlobalTradingStateStore } from './database-global-trading-state.store.js';
import { ProductionReadinessService, type ProductionReadiness, RoleReadinessService } from './readiness.js';
import { RuntimeAlertService } from './runtime-alert.service.js';

type SupportedKeyProvider = 'disabled' | 'local-dev' | 'mock' | 'kms' | 'hsm' | 'mpc' | 'custody';
const supportedKeyProviders = new Set<SupportedKeyProvider>(['disabled', 'local-dev', 'mock', 'kms', 'hsm', 'mpc', 'custody']);

@Injectable()
export class ProductionReadinessCollector {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readiness: ProductionReadinessService,
    private readonly roles: RoleReadinessService,
    private readonly states: DatabaseGlobalTradingStateStore,
    private readonly alerts: RuntimeAlertService,
  ) {}

  async collect(now = new Date()): Promise<ProductionReadiness> {
    const [policies, credentials, reconciliation, openCritical, evidence, alertingReady, control] = await Promise.all([
      this.prisma.db.rolePolicy.findMany({ where: { environment: 'PRODUCTION', status: 'ACTIVE', effectiveAt: { lte: now } } }),
      this.prisma.db.exchangeCredentialProfile.findMany({ where: { environment: 'PRODUCTION', status: 'ACTIVE' } }),
      this.prisma.db.reconciliationRun.findFirst({ orderBy: { startedAt: 'desc' } }),
      this.prisma.db.reconciliationDifference.count({ where: { severity: 'CRITICAL', status: 'OPEN' } }),
      this.prisma.db.productionReadinessEvidence.findMany({ where: { environment: 'PRODUCTION' } }),
      this.alerts.healthCheck(),
      this.states.read(),
    ]);

    const currentEvidence = new Map(evidence.filter((item) => item.status === 'PASS' && (!item.expiresAt || item.expiresAt > now)).map((item) => [item.control, item]));
    const roleResult = this.roles.evaluateProduction(policies);
    const admin = policies.find((policy) => policy.role === 'DEFAULT_ADMIN_ROLE');
    const treasury = policies.find((policy) => policy.role === 'TREASURY_ROLE');
    const executor = policies.find((policy) => policy.role === 'EXECUTOR_ROLE');
    const multisigConfigured = admin?.principalType === 'MULTISIG' && (admin.requiredApprovals >= 2 || currentEvidence.has('MULTISIG_SETUP'));
    const treasuryRoleSecure = treasury !== undefined && ['MPC', 'CUSTODY', 'HSM', 'KMS'].includes(treasury.principalType);
    const roleConcentration = roleResult.status !== 'PASS' || !executor || [admin?.principalReference, treasury?.principalReference].includes(executor.principalReference);
    const credentialTradeOnly = credentials.some((credential) => {
      const referenceOnly = /^(kms|vault|custody):\/\//.test(credential.credentialReference);
      const canTrade = credential.permissions.some((permission) => permission === 'SPOT_TRADE' || permission === 'FUTURES_TRADE');
      const canWithdraw = credential.permissions.some((permission) => permission.includes('WITHDRAW'));
      return referenceOnly && canTrade && !canWithdraw && (!credential.expiresAt || credential.expiresAt > now);
    });
    const reconciliationFreshnessMs = Number(process.env.RECONCILIATION_READINESS_MAX_AGE_MS ?? 300_000);
    const reconciliationHealthy = reconciliation?.status === 'PASSED' && reconciliation.finishedAt !== null
      && now.getTime() - reconciliation.finishedAt.getTime() <= reconciliationFreshnessMs && openCritical === 0;
    const keyProviderValue = process.env.KEY_PROVIDER ?? 'disabled';
    const keyProvider: SupportedKeyProvider = supportedKeyProviders.has(keyProviderValue as SupportedKeyProvider) ? keyProviderValue as SupportedKeyProvider : 'disabled';

    return this.readiness.evaluate({
      mainnetEnabled: process.env.MAINNET_ENABLED === 'true',
      realTradingEnabled: process.env.REAL_TRADING_ENABLED === 'true',
      realWithdrawalsEnabled: process.env.REAL_WITHDRAWALS_ENABLED === 'true',
      keyProvider,
      treasuryRoleSecure,
      multisigConfigured,
      credentialTradeOnly,
      reconciliationHealthy,
      killSwitchReady: control.version >= 1,
      alertingReady,
      auditReady: currentEvidence.has('AUDIT_PIPELINE'),
      rateLimitReady: currentEvidence.has('RATE_LIMIT_REVIEW'),
      backupVerified: currentEvidence.has('BACKUP_RESTORE_DRILL'),
      incidentRunbookReady: currentEvidence.has('INCIDENT_RUNBOOK'),
      securityAuditComplete: currentEvidence.has('SECURITY_AUDIT'),
      roleConcentration,
    });
  }
}
