import { describe, expect, it } from 'vitest';
import { ethereumAddressSchema } from './index.js';

describe('ethereumAddressSchema', () => {
  it('accepts a 20-byte hexadecimal address', () => {
    expect(ethereumAddressSchema.safeParse(`0x${'ab'.repeat(20)}`).success).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(ethereumAddressSchema.safeParse('0x1234').success).toBe(false);
  });
});
