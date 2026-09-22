import { Decimal } from 'decimal.js';

Decimal.set({ precision: 80, rounding: Decimal.ROUND_DOWN });

export interface XpConfig {
  readonly xpPerDollar: Decimal.Value;
  readonly dynamicXpPercent: Decimal.Value;
  readonly maxReferralDepth: number;
}

export interface NetworkPrincipalRow {
  readonly depth: number;
  readonly principalXp: Decimal.Value;
}

export interface XpCalculation {
  readonly principalXp: Decimal;
  readonly dynamicXp: Decimal;
  readonly totalXp: Decimal;
  readonly networkPrincipalXp: Decimal;
  readonly unlockedDepth: number;
}

export const calculateUnlockedDepth = (
  directValidReferrals: number,
  maxReferralDepth = 30,
): number => {
  if (!Number.isInteger(directValidReferrals) || directValidReferrals < 0) {
    throw new RangeError('directValidReferrals must be a non-negative integer');
  }
  if (!Number.isInteger(maxReferralDepth) || maxReferralDepth < 0) {
    throw new RangeError('maxReferralDepth must be a non-negative integer');
  }
  return Math.min(directValidReferrals * 3, maxReferralDepth);
};

export const principalXpForParticipation = (
  effectiveAmount: Decimal.Value,
  xpPerDollar: Decimal.Value,
): Decimal => {
  const amount = new Decimal(effectiveAmount);
  if (amount.isNegative()) throw new RangeError('effectiveAmount cannot be negative');
  return amount.mul(xpPerDollar);
};

export const calculateXp = (
  principalXp: Decimal.Value,
  directValidReferrals: number,
  descendants: readonly NetworkPrincipalRow[],
  config: XpConfig,
): XpCalculation => {
  const ownPrincipalXp = new Decimal(principalXp);
  if (ownPrincipalXp.isNegative()) throw new RangeError('principalXp cannot be negative');
  const unlockedDepth = calculateUnlockedDepth(directValidReferrals, config.maxReferralDepth);
  const networkPrincipalXp = descendants.reduce((sum, row) => {
    if (!Number.isInteger(row.depth) || row.depth <= 0) {
      throw new RangeError('descendant depth must be a positive integer');
    }
    const descendantPrincipal = new Decimal(row.principalXp);
    if (descendantPrincipal.isNegative()) {
      throw new RangeError('descendant principalXp cannot be negative');
    }
    return row.depth <= unlockedDepth ? sum.plus(descendantPrincipal) : sum;
  }, new Decimal(0));
  const dynamicXp = networkPrincipalXp.mul(config.dynamicXpPercent);
  return {
    principalXp: ownPrincipalXp,
    dynamicXp,
    totalXp: ownPrincipalXp.plus(dynamicXp),
    networkPrincipalXp,
    unlockedDepth,
  };
};
