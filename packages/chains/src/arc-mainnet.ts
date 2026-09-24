import type { ChainConfig } from './types.js';

export const ARC_MAINNET_CHAIN_ID = 5_042;

export const arcMainnetConfig = {
  id: ARC_MAINNET_CHAIN_ID,
  name: 'Arc',
  networkKey: 'arc-mainnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: ['https://rpc.mainnet.arc.io'],
  webSocketUrls: [],
  blockExplorerUrls: ['https://explorer.arc.io'],
  usdc: {
    symbol: 'USDC',
    address: '0x3600000000000000000000000000000000000000',
    decimals: 6,
    chainId: ARC_MAINNET_CHAIN_ID,
    isGasToken: true,
    isDepositAsset: false,
  },
  finality: {
    kind: 'deterministic',
    confirmations: 0,
    supportsFinalizedBlockTag: false,
    description: 'Arc blocks are permanent once produced; process each observed block without a confirmation delay.',
  },
  enabled: false,
  isTestnet: false,
} as const satisfies ChainConfig;
