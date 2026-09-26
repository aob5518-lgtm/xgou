export type ReadinessStatus = 'PASS' | 'WARN' | 'FAIL';
export interface ReadinessCheck { readonly name: string; readonly status: ReadinessStatus; readonly critical: boolean; readonly reason: string; }
export interface ProductionReadiness { readonly status: ReadinessStatus; readonly checks: readonly ReadinessCheck[]; readonly evaluatedAt: Date; }

export interface ReadinessInput {
  readonly mainnetEnabled: boolean;
  readonly realTradingEnabled: boolean;
  readonly realWithdrawalsEnabled: boolean;
  readonly keyProvider: 'disabled' | 'local-dev' | 'mock' | 'kms' | 'hsm' | 'mpc' | 'custody';
  readonly treasuryRoleSecure: boolean;
  readonly multisigConfigured: boolean;
  readonly credentialTradeOnly: boolean;
  readonly reconciliationHealthy: boolean;
  readonly killSwitchReady: boolean;
  readonly alertingReady: boolean;
  readonly auditReady: boolean;
  readonly rateLimitReady: boolean;
  readonly backupVerified: boolean;
  readonly incidentRunbookReady: boolean;
  readonly securityAuditComplete: boolean;
  readonly roleConcentration: boolean;
}

export class RoleReadinessService {
  evaluateProduction(policies: readonly { readonly role: string; readonly principalType: string; readonly principalReference: string }[]): ReadinessCheck {
    const sensitive = policies.filter((policy) => ['DEFAULT_ADMIN_ROLE', 'TREASURY_ROLE', 'EXECUTOR_ROLE'].includes(policy.role));
    const insecure = sensitive.some((policy) => policy.principalType === 'EOA_DEV');
    const concentrated = new Map<string, Set<string>>();
    for (const policy of sensitive) {
      const roles = concentrated.get(policy.principalReference) ?? new Set<string>();
      roles.add(policy.role);
      concentrated.set(policy.principalReference, roles);
    }
    if (insecure || [...concentrated.values()].some((roles) => roles.size > 1)) return { name: 'TREASURY_ROLE', status: 'FAIL', critical: true, reason: 'production roles must not use or concentrate on a deployer EOA' };
    return { name: 'TREASURY_ROLE', status: 'PASS', critical: true, reason: 'production roles are separated' };
  }
}

export class ProductionReadinessService {
  evaluate(input: ReadinessInput): ProductionReadiness {
    const check = (name: string, pass: boolean, reason: string, critical = true): ReadinessCheck => ({ name, status: pass ? 'PASS' : 'FAIL', critical, reason });
    const checks: ReadinessCheck[] = [
      check('MAINNET_ENABLED', !input.mainnetEnabled, 'Phase 5 requires mainnet disabled'),
      check('REAL_TRADING_ENABLED', !input.realTradingEnabled, 'Phase 5 requires real trading disabled'),
      check('REAL_WITHDRAWALS_ENABLED', !input.realWithdrawalsEnabled, 'Phase 5 requires real withdrawals disabled'),
      check('KEY_PROVIDER', ['kms', 'hsm', 'mpc', 'custody'].includes(input.keyProvider), 'production requires a managed key provider'),
      check('TREASURY_ROLE', input.treasuryRoleSecure && !input.roleConcentration, 'admin, treasury and executor must be separated'),
      check('MULTISIG', input.multisigConfigured, 'admin and risk operations require multisig'),
      check('EXCHANGE_CREDENTIAL_PERMISSION', input.credentialTradeOnly, 'credentials must be trade-only with withdrawal disabled'),
      check('RECONCILIATION', input.reconciliationHealthy, 'production reconciliation must be healthy'),
      check('KILL_SWITCH', input.killSwitchReady, 'global kill switch must be ready'),
      check('ALERTING', input.alertingReady, 'critical alerting must be ready'),
      check('AUDIT', input.auditReady, 'immutable audit must be ready'),
      check('RATE_LIMIT', input.rateLimitReady, 'sensitive endpoints need strict limits'),
      check('BACKUP', input.backupVerified, 'restore drill must be verified'),
      check('INCIDENT_RUNBOOK', input.incidentRunbookReady, 'incident runbooks must exist'),
      check('SECURITY_AUDIT', input.securityAuditComplete, 'security audit is required'),
    ];
    return { status: checks.some((item) => item.critical && item.status === 'FAIL') ? 'FAIL' : checks.some((item) => item.status === 'WARN') ? 'WARN' : 'PASS', checks, evaluatedAt: new Date() };
  }
  assertCanEnableRealTrading(readiness: ProductionReadiness, approved: boolean): void {
    if (readiness.status !== 'PASS' || !approved) throw new Error('real trading enable gate failed');
  }
  assertCanEnableMainnet(readiness: ProductionReadiness, approved: boolean): void {
    if (readiness.status !== 'PASS' || !approved) throw new Error('mainnet enable gate failed');
  }
}

export interface ApprovalInput { readonly requestedBy: string; readonly requiredApprovals: number; readonly approvals: readonly { readonly approverId: string; readonly decision: 'APPROVE' | 'REJECT' }[]; readonly expiresAt: Date; }
export const evaluateApproval = (input: ApprovalInput, now = new Date()): 'APPROVED' | 'PENDING' | 'REJECTED' | 'EXPIRED' => {
  if (now >= input.expiresAt) return 'EXPIRED';
  if (input.approvals.some((approval) => approval.decision === 'REJECT')) return 'REJECTED';
  const independent = new Set(input.approvals.filter((approval) => approval.decision === 'APPROVE' && approval.approverId !== input.requestedBy).map((approval) => approval.approverId));
  return independent.size >= input.requiredApprovals ? 'APPROVED' : 'PENDING';
};

export interface SensitiveActionContext { readonly recentAuthAt: Date; readonly assurance: 'SIWE' | 'TOTP' | 'WEBAUTHN' | 'HARDWARE_KEY'; readonly actorId: string; }
export interface BreakGlassPolicy { readonly manualApproval: boolean; readonly scope: readonly string[]; readonly expiresAt: Date; readonly auditReference: string; }
export const validateBreakGlass = (policy: BreakGlassPolicy, now = new Date()): void => {
  if (!policy.manualApproval || policy.scope.length === 0 || now >= policy.expiresAt || !policy.auditReference) throw new Error('invalid break-glass authorization');
  if (policy.scope.includes('BYPASS_RISK_ENGINE')) throw new Error('break-glass cannot bypass the risk engine');
};
