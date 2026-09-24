export interface ArcTestnetDeployment {
  readonly networkKey: 'arc-testnet';
  readonly chainId: 5042002;
  readonly deployed: true;
  readonly deployedAt: string;
  readonly deploymentBlock: number;
  readonly deployer: `0x${string}`;
  readonly depositRouter: `0x${string}`;
  readonly bullVault: `0x${string}`;
  readonly spotVault: `0x${string}`;
  readonly futuresVault: `0x${string}`;
  readonly usdc: `0x${string}`;
  readonly txHashes: Readonly<Record<string, `0x${string}`>>;
  readonly contractVersions: Readonly<Record<string, string>>;
  readonly verified: boolean;
}

export interface ArcTestnetDeploymentState extends Omit<ArcTestnetDeployment, 'deployed' | 'deployedAt' | 'deploymentBlock' | 'deployer' | 'depositRouter' | 'bullVault' | 'spotVault' | 'futuresVault'> {
  readonly deployed: boolean;
  readonly deployedAt: string | null;
  readonly deploymentBlock: number | null;
  readonly deployer: `0x${string}` | null;
  readonly depositRouter: `0x${string}` | null;
  readonly bullVault: `0x${string}` | null;
  readonly spotVault: `0x${string}` | null;
  readonly futuresVault: `0x${string}` | null;
}

export function getArcTestnetDeployment(): ArcTestnetDeployment;
export function getArcTestnetDeploymentState(): ArcTestnetDeploymentState;
