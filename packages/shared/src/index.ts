import { z } from 'zod';
import { Decimal } from 'decimal.js';

export const ethereumAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

export const requestNonceSchema = z.object({ walletAddress: ethereumAddressSchema });

export const verifySiweSchema = z.object({
  message: z.string().min(1).max(4096),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/).max(2048),
});

export const bindInviterSchema = z.object({ inviterWalletAddress: ethereumAddressSchema });

export const createDepositSchema = z.object({
  amount: z.string().regex(/^\d+(?:\.\d{1,18})?$/).refine((value) => new Decimal(value).gt(0)),
  asset: z.enum(['USDC', 'USDT']),
  chainId: z.string().min(1).max(64),
  tokenDecimals: z.number().int().min(0).max(255),
  externalRef: z.string().min(1).max(160),
  idempotencyKey: z.string().min(8).max(128),
});

export const SYSTEM_CONFIG_DEFAULTS = {
  minReferralQualification: '100',
  maxReferralDepth: 30,
  xpPerDollar: '1',
  dynamicXpPercent: '0.01',
  bullAllocation: '0.50',
  spotStrategyAllocation: '0.30',
  futuresStrategyAllocation: '0.20',
  rewardWithdrawalFee: '0.05',
  spotLiquidityReserve: '0.20',
  futuresLiquidityReserve: '0.35',
  maxSpotAssetExposure: '0.20',
  maxSpotStrategyAllocation: '0.25',
  maxFuturesLeverage: '3',
  maxFuturesPositionRisk: '0.02',
  maxFuturesAssetExposure: '0.20',
  maxDailyLoss: '0.02',
  maxWeeklyLoss: '0.05',
  maxDrawdown: '0.15',
  minLiquidationDistance: '0.20',
  arcGasReserve: '100',
} as const;

const nonNegativeDecimalString = z.string().regex(/^\d+(?:\.\d+)?$/);

const ratioString = nonNegativeDecimalString.refine((value) => new Decimal(value).lte(1), {
  message: 'ratio must be between 0 and 1',
});

export const systemConfigSchema = z
  .object({
    minReferralQualification: nonNegativeDecimalString,
    maxReferralDepth: z.number().int().min(0).max(30),
    xpPerDollar: nonNegativeDecimalString,
    dynamicXpPercent: ratioString,
    bullAllocation: ratioString,
    spotStrategyAllocation: ratioString,
    futuresStrategyAllocation: ratioString,
    rewardWithdrawalFee: ratioString,
    spotLiquidityReserve: ratioString,
    futuresLiquidityReserve: ratioString,
    maxSpotAssetExposure: ratioString,
    maxSpotStrategyAllocation: ratioString,
    maxFuturesLeverage: nonNegativeDecimalString,
    maxFuturesPositionRisk: ratioString,
    maxFuturesAssetExposure: ratioString,
    maxDailyLoss: ratioString,
    maxWeeklyLoss: ratioString,
    maxDrawdown: ratioString,
    minLiquidationDistance: ratioString,
    arcGasReserve: nonNegativeDecimalString,
  })
  .superRefine((config, context) => {
    const total = new Decimal(config.bullAllocation)
      .plus(config.spotStrategyAllocation)
      .plus(config.futuresStrategyAllocation);
    if (!total.eq(1)) {
      context.addIssue({
        code: 'custom',
        path: ['bullAllocation'],
        message: 'bull + spot + futures allocations must equal exactly 1.00',
      });
    }
  });

export type SystemConfig = z.infer<typeof systemConfigSchema>;
