import { z } from 'zod';

export const ethereumAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

export const requestNonceSchema = z.object({ walletAddress: ethereumAddressSchema });

export const verifySiweSchema = z.object({
  message: z.string().min(1).max(4096),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/).max(2048),
});

export const bindInviterSchema = z.object({ inviterWalletAddress: ethereumAddressSchema });

export const SYSTEM_CONFIG_DEFAULTS = {
  minReferralQualification: '100',
  maxReferralDepth: 30,
  xpPerDollar: '1',
  dynamicXpPercent: '0.01',
} as const;

const nonNegativeDecimalString = z.string().regex(/^\d+(?:\.\d+)?$/);

export const systemConfigSchema = z.object({
  minReferralQualification: nonNegativeDecimalString,
  maxReferralDepth: z.number().int().min(0).max(30),
  xpPerDollar: nonNegativeDecimalString,
  dynamicXpPercent: nonNegativeDecimalString,
});

export type SystemConfig = z.infer<typeof systemConfigSchema>;
