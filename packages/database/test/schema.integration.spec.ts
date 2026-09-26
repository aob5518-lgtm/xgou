import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const schemaPath = new URL('../prisma/schema.prisma', import.meta.url);
const migrationPath = new URL(
  '../prisma/migrations/20260921153000_phase1_core/migration.sql',
  import.meta.url,
);
const phase2MigrationPath = new URL(
  '../prisma/migrations/20260922043000_phase2a_fund_ledger/migration.sql',
  import.meta.url,
);
const spotRuntimeMigrationPath = new URL(
  '../prisma/migrations/20260925120000_finalize_spot_paper_runtime/migration.sql',
  import.meta.url,
);
const futuresMigrationPath = new URL(
  '../prisma/migrations/20260926120000_phase3b_futures_paper_trading/migration.sql',
  import.meta.url,
);
const rewardMigrationPath = new URL(
  '../prisma/migrations/20260927120000_phase4_paper_reward_settlement/migration.sql',
  import.meta.url,
);

describe('Phase 1 database artifacts', () => {
  it('stores asset and XP amounts as Decimal and defines the referral closure identity', async () => {
    const schema = await readFile(schemaPath, 'utf8');
    expect(schema).toContain('@db.Decimal(36, 18)');
    expect(schema).toContain('@@id([ancestorId, descendantId])');
    expect(schema).not.toMatch(/\bFloat\b/);
  });

  it('enforces graph, positive amount and append-only audit invariants in SQL', async () => {
    const migration = await readFile(migrationPath, 'utf8');
    expect(migration).toContain('ReferralClosure_self_depth_check');
    expect(migration).toContain('Participation_amount_positive');
    expect(migration).toContain('AuditLog_prevent_update_delete');
  });
});

describe('Phase 3B futures paper persistence', () => {
  it('persists margin, funding, liquidation and restart recovery state', async () => {
    const [schema, migration] = await Promise.all([readFile(schemaPath, 'utf8'), readFile(futuresMigrationPath, 'utf8')]);
    for (const model of ['FuturesPosition', 'FundingPayment', 'FuturesLiquidation']) {
      expect(schema).toContain(`model ${model}`);
      expect(migration).toContain(`CREATE TABLE "${model}"`);
    }
    for (const field of ['equity', 'marginUsed', 'availableMargin', 'grossExposure', 'netExposure', 'fundingPnl', 'consecutiveLosses', 'liquidationDistance']) {
      expect(schema).toContain(field);
      expect(migration).toContain(`"${field}"`);
    }
  });

  it('enforces one-way positions and funding/cycle idempotency', async () => {
    const migration = await readFile(futuresMigrationPath, 'utf8');
    expect(migration).toContain('FuturesPosition_strategyAccountId_symbol_key');
    expect(migration).toContain('FundingPayment_idempotencyKey_key');
    expect(migration).toContain('FuturesLiquidation_cycleId_key');
  });
});

describe('Phase 2A fund and ledger database artifacts', () => {
  it('defines append-only double-entry models without a mutable balance column', async () => {
    const schema = await readFile(schemaPath, 'utf8');
    const ledgerAccount = schema.match(/model LedgerAccount \{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(schema).toContain('model LedgerTransaction');
    expect(schema).toContain('model LedgerEntry');
    expect(schema).toContain('model FundAllocation');
    expect(ledgerAccount).not.toMatch(/\bbalance\b/);
  });

  it('enforces balancing, immutability, and fund-domain boundaries in SQL', async () => {
    const migration = await readFile(phase2MigrationPath, 'utf8');
    expect(migration).toContain('assert_ledger_transaction_balanced');
    expect(migration).toContain('LedgerEntry_immutable');
    expect(migration).toContain('LedgerAccount_identity_immutable');
    expect(migration).toContain('LedgerAccount_fund_domain_boundary');
    expect(migration).toContain('FundAllocation_ratio_valid');
  });
});

describe('Phase 3A paper runtime persistence', () => {
  it('persists mark, stop, daily and weekly recovery state', async () => {
    const [schema, migration] = await Promise.all([
      readFile(schemaPath, 'utf8'),
      readFile(spotRuntimeMigrationPath, 'utf8'),
    ]);
    for (const field of ['markedAt', 'stopLoss', 'takeProfit', 'dailyOpeningNav', 'dailyBaselineAt', 'weeklyOpeningNav', 'weeklyBaselineAt']) {
      expect(schema).toContain(field);
      expect(migration).toContain(`"${field}"`);
    }
  });

  it('persists restart recovery state and rejects duplicate strategy cycles', async () => {
    const schema = await readFile(schemaPath, 'utf8');
    expect(schema).toContain('model CircuitBreakerState');
    expect(schema).toContain('dailyBaselineAt');
    expect(schema).toContain('weeklyBaselineAt');
    expect(schema).toContain('markedAt');
    expect(schema).toContain('@@unique([strategyId, cycleId])');
  });
});

describe('Phase 4 paper reward settlement persistence', () => {
  it('stores frozen source, XP and user allocation records with unique epoch identities', async () => {
    const [schema, migration] = await Promise.all([readFile(schemaPath, 'utf8'), readFile(rewardMigrationPath, 'utf8')]);
    for (const model of ['RewardFundState', 'RewardSettlementCursor', 'SettlementSourceSnapshot', 'UserRewardAllocation', 'RewardAuditEvent']) {
      expect(schema).toContain(`model ${model}`);
      expect(migration).toContain(`CREATE TABLE "${model}"`);
    }
    expect(schema).toContain('@@unique([rewardEpochId, userId])');
    expect(schema).toContain('@@unique([mode, strategyCode])');
  });

  it('protects finalized epoch inputs and allocations from mutation', async () => {
    const migration = await readFile(rewardMigrationPath, 'utf8');
    expect(migration).toContain('RewardEpoch_finalized_immutable');
    expect(migration).toContain('SettlementSourceSnapshot_finalized_immutable');
    expect(migration).toContain('UserRewardAllocation_finalized_immutable');
    expect(migration).toContain('XpSnapshot_finalized_immutable');
  });
});
