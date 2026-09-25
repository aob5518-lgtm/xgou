import { describe, expect, it } from 'vitest';
import { ethereumAddressSchema, SYSTEM_CONFIG_DEFAULTS, systemConfigSchema } from './index.js';

describe('ethereumAddressSchema', () => {
  it('accepts a 20-byte hexadecimal address', () => {
    expect(ethereumAddressSchema.safeParse(`0x${'ab'.repeat(20)}`).success).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(ethereumAddressSchema.safeParse('0x1234').success).toBe(false);
  });
});

describe('systemConfigSchema', () => {
  it('accepts the default 50/30/20 allocation', () => {
    expect(systemConfigSchema.parse(SYSTEM_CONFIG_DEFAULTS)).toMatchObject({
      bullAllocation: '0.50',
      spotStrategyAllocation: '0.30',
      futuresStrategyAllocation: '0.20',
      futuresPaperTradingEnabled: false,
      futuresMaxGrossExposure: '0.65',
      futuresMaxNetExposure: '0.50',
      futuresMaxMarginUsage: '0.50',
    });
  });

  it('rejects under-allocation and over-allocation', () => {
    expect(
      systemConfigSchema.safeParse({ ...SYSTEM_CONFIG_DEFAULTS, futuresStrategyAllocation: '0.19' }).success,
    ).toBe(false);
    expect(
      systemConfigSchema.safeParse({ ...SYSTEM_CONFIG_DEFAULTS, futuresStrategyAllocation: '0.21' }).success,
    ).toBe(false);
  });
});
