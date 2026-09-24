import { describe, expect, it } from 'vitest';
import { arcMainnetConfig, arcTestnetConfig, getChainConfig } from './index.js';

describe('chain registry', () => {
  it('keeps Arc Testnet and token metadata in one config', () => {
    expect(getChainConfig('arc-testnet')).toBe(arcTestnetConfig);
    expect(arcTestnetConfig.id).toBe(5_042_002);
    expect(arcTestnetConfig.nativeCurrency.decimals).toBe(18);
    expect(arcTestnetConfig.usdc.decimals).toBe(6);
    expect(arcTestnetConfig.usdc.chainId).toBe(arcTestnetConfig.id);
  });

  it('keeps mainnet disabled during Phase 2B', () => {
    expect(arcMainnetConfig.enabled).toBe(false);
    expect(() => getChainConfig('arc-mainnet')).toThrow('disabled');
  });
});
