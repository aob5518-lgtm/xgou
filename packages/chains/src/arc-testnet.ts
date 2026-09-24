import type { ChainConfig } from './types.js';

export const ARC_TESTNET_CHAIN_ID = 5_042_002;

export const arcTestnetConfig = {
  id: ARC_TESTNET_CHAIN_ID,
  name: 'Arc Testnet',
  networkKey: 'arc-testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: ['https://rpc.testnet.arc.io'],
  webSocketUrls: ['wss://rpc.testnet.arc.io'],
  blockExplorerUrls: ['https://explorer.testnet.arc.io'],
  usdc: {
    symbol: 'USDC',
    address: '0x3600000000000000000000000000000000000000',
    decimals: 6,
    chainId: ARC_TESTNET_CHAIN_ID,
    isGasToken: true,
    isDepositAsset: true,
  },
  finality: {
    kind: 'deterministic',
    confirmations: 0,
    supportsFinalizedBlockTag: false,
    description: 'Arc blocks are permanent once produced; process each observed block without a confirmation delay.',
  },
  enabled: true,
  isTestnet: true,
  faucetUrl: 'https://faucet.circle.com',
} as const satisfies ChainConfig;
