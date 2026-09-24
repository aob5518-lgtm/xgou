export type ChainEnvironment = 'arc-testnet' | 'arc-mainnet';

export interface NativeCurrencyMetadata {
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
}

export interface TokenMetadata {
  readonly symbol: string;
  readonly address: `0x${string}`;
  readonly decimals: number;
  readonly chainId: number;
  readonly isGasToken: boolean;
  readonly isDepositAsset: boolean;
}

export interface FinalityPolicy {
  readonly kind: 'deterministic';
  readonly confirmations: 0;
  readonly supportsFinalizedBlockTag: boolean;
  readonly description: string;
}

export interface ChainConfig {
  readonly id: number;
  readonly name: string;
  readonly networkKey: ChainEnvironment;
  readonly nativeCurrency: NativeCurrencyMetadata;
  readonly rpcUrls: readonly string[];
  readonly webSocketUrls: readonly string[];
  readonly blockExplorerUrls: readonly string[];
  readonly usdc: TokenMetadata;
  readonly finality: FinalityPolicy;
  readonly enabled: boolean;
  readonly isTestnet: boolean;
  readonly faucetUrl?: string;
}
