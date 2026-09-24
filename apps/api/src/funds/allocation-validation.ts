import type { SystemConfig } from '@xgou/shared';
import { Decimal } from 'decimal.js';

const BASIS_POINTS = BigInt(10_000);

const ratioToBasisPoints = (ratio: string, name: string): bigint => {
  const scaled = new Decimal(ratio).mul(BASIS_POINTS.toString());
  if (!scaled.isInteger()) throw new Error(`${name} must resolve to whole basis points`);
  return BigInt(scaled.toFixed(0));
};

export interface MinimumUnitAllocation {
  readonly bull: bigint;
  readonly spot: bigint;
  readonly futures: bigint;
}

export const expectedMinimumUnitAllocation = (
  amount: bigint,
  config: Pick<SystemConfig, 'bullAllocation' | 'spotStrategyAllocation' | 'futuresStrategyAllocation'>,
): MinimumUnitAllocation => {
  const bullBps = ratioToBasisPoints(config.bullAllocation, 'bullAllocation');
  const spotBps = ratioToBasisPoints(config.spotStrategyAllocation, 'spotStrategyAllocation');
  const futuresBps = ratioToBasisPoints(config.futuresStrategyAllocation, 'futuresStrategyAllocation');
  if (bullBps + spotBps + futuresBps !== BASIS_POINTS) throw new Error('allocation basis points must total 10000');
  const bull = amount * bullBps / BASIS_POINTS;
  const spot = amount * spotBps / BASIS_POINTS;
  return { bull, spot, futures: amount - bull - spot };
};

export const findAllocationMismatch = (
  amount: bigint,
  actual: MinimumUnitAllocation,
  config: Pick<SystemConfig, 'bullAllocation' | 'spotStrategyAllocation' | 'futuresStrategyAllocation'>,
): string | null => {
  const expected = expectedMinimumUnitAllocation(amount, config);
  if (actual.bull !== expected.bull) return `bull allocation mismatch: expected ${String(expected.bull)}, received ${String(actual.bull)}`;
  if (actual.spot !== expected.spot) return `spot allocation mismatch: expected ${String(expected.spot)}, received ${String(actual.spot)}`;
  if (actual.futures !== expected.futures) return `futures allocation mismatch: expected ${String(expected.futures)}, received ${String(actual.futures)}`;
  return null;
};
