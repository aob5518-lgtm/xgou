import { describe, expect, it } from 'vitest';
import { SYSTEM_CONFIG_DEFAULTS } from '@xgou/shared';
import { expectedMinimumUnitAllocation, findAllocationMismatch } from './allocation-validation.js';

describe('minimum-unit allocation validation', () => {
  it('accepts the configured 50/30/20 allocation exactly', () => {
    const amount = BigInt(100) * BigInt(1_000_000);
    expect(expectedMinimumUnitAllocation(amount, SYSTEM_CONFIG_DEFAULTS)).toEqual({
      bull: BigInt(50) * BigInt(1_000_000),
      spot: BigInt(30) * BigInt(1_000_000),
      futures: BigInt(20) * BigInt(1_000_000),
    });
  });

  it('rejects an onchain 40/40/20 event when backend config is 50/30/20', () => {
    const unit = BigInt(1_000_000);
    const mismatch = findAllocationMismatch(
      BigInt(100) * unit,
      { bull: BigInt(40) * unit, spot: BigInt(40) * unit, futures: BigInt(20) * unit },
      SYSTEM_CONFIG_DEFAULTS,
    );
    expect(mismatch).toContain('bull allocation mismatch');
  });

  it('assigns integer-division remainder to futures exactly like DepositRouter', () => {
    expect(expectedMinimumUnitAllocation(BigInt(1), SYSTEM_CONFIG_DEFAULTS)).toEqual({
      bull: BigInt(0), spot: BigInt(0), futures: BigInt(1),
    });
  });
});
