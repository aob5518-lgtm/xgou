import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const schemaPath = new URL('../prisma/schema.prisma', import.meta.url);
const migrationPath = new URL(
  '../prisma/migrations/20260921153000_phase1_core/migration.sql',
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
