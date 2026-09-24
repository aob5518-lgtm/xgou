import { arcMainnetConfig } from './arc-mainnet.js';
import { arcTestnetConfig } from './arc-testnet.js';
import type { ChainConfig, ChainEnvironment } from './types.js';

export * from './arc-mainnet.js';
export * from './arc-testnet.js';
export type * from './types.js';

const registry: Readonly<Record<ChainEnvironment, ChainConfig>> = {
  'arc-testnet': arcTestnetConfig,
  'arc-mainnet': arcMainnetConfig,
};

export function isChainEnvironment(value: string): value is ChainEnvironment {
  return value === 'arc-testnet' || value === 'arc-mainnet';
}

export function getChainConfig(environment: string | undefined = 'arc-testnet'): ChainConfig {
  if (!isChainEnvironment(environment)) throw new Error(`Unsupported CHAIN_ENV: ${environment}`);
  const chain = registry[environment];
  if (!chain.enabled) throw new Error(`${chain.name} is disabled for this release`);
  return chain;
}
