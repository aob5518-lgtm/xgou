import { describe, expect, it } from 'vitest';
import { evaluateApproval, ProductionReadinessService, RoleReadinessService, validateBreakGlass } from './readiness.js';
import { TreasuryDryRunService } from './treasury-dry-run.service.js';

describe('production controls', () => {
  it('fails readiness while Phase 5 production dependencies remain deliberately incomplete', () => {
    const readiness = new ProductionReadinessService().evaluate({ mainnetEnabled: false, realTradingEnabled: false, realWithdrawalsEnabled: false, keyProvider: 'disabled', treasuryRoleSecure: false, multisigConfigured: false, credentialTradeOnly: false, reconciliationHealthy: true, killSwitchReady: true, alertingReady: false, auditReady: true, rateLimitReady: true, backupVerified: false, incidentRunbookReady: true, securityAuditComplete: false, roleConcentration: true });
    expect(readiness.status).toBe('FAIL');
    expect(() => { new ProductionReadinessService().assertCanEnableRealTrading(readiness, true); }).toThrow('gate failed');
    expect(() => { new ProductionReadinessService().assertCanEnableMainnet(readiness, true); }).toThrow('gate failed');
  });
  it('fails production role concentration on one EOA', () => {
    expect(new RoleReadinessService().evaluateProduction(['DEFAULT_ADMIN_ROLE', 'TREASURY_ROLE', 'EXECUTOR_ROLE'].map((role) => ({ role, principalType: 'EOA_DEV', principalReference: 'deployer' }))).status).toBe('FAIL');
  });
  it('does not permit requesters to self-approve a sensitive action', () => {
    expect(evaluateApproval({ requestedBy: 'alice', requiredApprovals: 1, expiresAt: new Date(Date.now() + 1000), approvals: [{ approverId: 'alice', decision: 'APPROVE' }] })).toBe('PENDING');
    expect(evaluateApproval({ requestedBy: 'alice', requiredApprovals: 1, expiresAt: new Date(Date.now() + 1000), approvals: [{ approverId: 'bob', decision: 'APPROVE' }] })).toBe('APPROVED');
  });
  it('evaluates treasury movement but never broadcasts it', () => {
    const result = new TreasuryDryRunService().evaluate({ source: 'vault', destination: '0xabc', asset: 'USDC', amount: '100', chainId: '5042002', availableGas: '100.2', gasReserve: '100' }, true, true);
    expect(result).toMatchObject({ policyCheck: 'APPROVED', requiredApprovals: 2, wouldExecute: false });
    expect(new TreasuryDryRunService().evaluate({ source: 'vault', destination: '0xbad', asset: 'USDC', amount: '100', chainId: '5042002', availableGas: '100', gasReserve: '100' }, false, true).reasons).toEqual(expect.arrayContaining(['DESTINATION_NOT_ALLOWLISTED', 'GAS_RESERVE_RISK']));
  });
  it('keeps break-glass manual, scoped, short-lived and unable to bypass risk', () => {
    expect(() => { validateBreakGlass({ manualApproval: true, scope: ['BYPASS_RISK_ENGINE'], expiresAt: new Date(Date.now() + 1000), auditReference: 'audit-1' }); }).toThrow('cannot bypass');
  });
});
