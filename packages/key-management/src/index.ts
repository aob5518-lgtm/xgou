export type KeyProviderStatus = 'HEALTHY' | 'UNHEALTHY' | 'DISABLED';

export interface SignerContext {
  readonly environment: 'development' | 'test' | 'production';
  readonly purpose: 'DRY_RUN' | 'TREASURY' | 'TRADING';
  readonly principalReference: string;
}

export interface SignerHandle {
  readonly provider: string;
  readonly keyReference: string;
  readonly expiresAt: Date;
}

export interface SignatureResult {
  readonly algorithm: string;
  readonly signature: string;
  readonly keyReference: string;
}

export interface KeyProviderHealth {
  readonly status: KeyProviderStatus;
  readonly provider: string;
  readonly checkedAt: Date;
  readonly reason?: string;
}

export interface KeyProvider {
  getSigner(context: SignerContext): Promise<SignerHandle>;
  signTransaction(request: { readonly signer: SignerHandle; readonly payload: Uint8Array }): Promise<SignatureResult>;
  signMessage(request: { readonly signer: SignerHandle; readonly message: Uint8Array }): Promise<SignatureResult>;
  healthCheck(): Promise<KeyProviderHealth>;
}

export class DisabledKeyProvider implements KeyProvider {
  getSigner(): Promise<SignerHandle> { return Promise.reject(new Error('key provider is disabled')); }
  signTransaction(): Promise<SignatureResult> { return Promise.reject(new Error('key provider is disabled')); }
  signMessage(): Promise<SignatureResult> { return Promise.reject(new Error('key provider is disabled')); }
  healthCheck(): Promise<KeyProviderHealth> { return Promise.resolve({ status: 'DISABLED', provider: 'disabled', checkedAt: new Date() }); }
}

export class MockKeyProvider implements KeyProvider {
  getSigner(context: SignerContext): Promise<SignerHandle> {
    return Promise.resolve({ provider: 'mock', keyReference: context.principalReference, expiresAt: new Date(Date.now() + 30_000) });
  }
  signTransaction(request: { readonly signer: SignerHandle }): Promise<SignatureResult> {
    return Promise.resolve({ algorithm: 'MOCK', signature: 'mock-transaction-signature', keyReference: request.signer.keyReference });
  }
  signMessage(request: { readonly signer: SignerHandle }): Promise<SignatureResult> {
    return Promise.resolve({ algorithm: 'MOCK', signature: 'mock-message-signature', keyReference: request.signer.keyReference });
  }
  healthCheck(): Promise<KeyProviderHealth> { return Promise.resolve({ status: 'HEALTHY', provider: 'mock', checkedAt: new Date() }); }
}

export class LocalDevKeyProvider extends MockKeyProvider {
  constructor(nodeEnvironment: string | undefined = process.env.NODE_ENV) {
    super();
    if (nodeEnvironment === 'production') throw new Error('LocalDevKeyProvider is forbidden in production');
  }
}

export type CredentialPermission = 'READ' | 'SPOT_TRADE' | 'FUTURES_TRADE' | 'WITHDRAW';
export interface CredentialMetadata {
  readonly exchange: string;
  readonly environment: 'development' | 'test' | 'production';
  readonly permissions: readonly CredentialPermission[];
  readonly expiresAt?: Date;
}
export interface CredentialHandle {
  readonly reference: string;
  readonly metadata: CredentialMetadata;
  use<T>(operation: (opaqueCredential: object) => Promise<T>): Promise<T>;
  toJSON(): { readonly reference: string; readonly metadata: CredentialMetadata };
}
export interface CredentialProvider { resolve(reference: string): Promise<CredentialHandle>; }

export class DisabledCredentialProvider implements CredentialProvider {
  resolve(): Promise<CredentialHandle> { return Promise.reject(new Error('credential provider is disabled')); }
}

class EphemeralCredentialHandle implements CredentialHandle {
  constructor(readonly reference: string, readonly metadata: CredentialMetadata, private readonly opaque: object) {}
  async use<T>(operation: (opaqueCredential: object) => Promise<T>): Promise<T> { return operation(this.opaque); }
  toJSON(): { readonly reference: string; readonly metadata: CredentialMetadata } { return { reference: this.reference, metadata: this.metadata }; }
}

export class MockCredentialProvider implements CredentialProvider {
  constructor(private readonly fixtures: ReadonlyMap<string, { readonly metadata: CredentialMetadata; readonly opaque?: object }>) {}
  resolve(reference: string): Promise<CredentialHandle> {
    if (!/^(kms|vault|custody):\/\//.test(reference)) return Promise.reject(new Error('credential must be stored as a secret reference'));
    const fixture = this.fixtures.get(reference);
    if (!fixture) return Promise.reject(new Error('credential reference not found'));
    return Promise.resolve(new EphemeralCredentialHandle(reference, fixture.metadata, fixture.opaque ?? {}));
  }
}

export const assertTradeOnlyCredential = (metadata: CredentialMetadata): void => {
  if (metadata.permissions.includes('WITHDRAW')) throw new Error('withdraw-enabled credentials are forbidden');
  if (!metadata.permissions.some((permission) => permission === 'SPOT_TRADE' || permission === 'FUTURES_TRADE')) {
    throw new Error('credential does not grant trading permission');
  }
  if (metadata.expiresAt && metadata.expiresAt.getTime() <= Date.now()) throw new Error('credential is expired');
};

export interface EnvironmentSecurityInput {
  readonly nodeEnvironment?: string | undefined;
  readonly executionMode?: string | undefined;
  readonly keyProvider?: string | undefined;
  readonly credentialProvider?: string | undefined;
  readonly liveTransportEnabled?: string | undefined;
  readonly mainnetEnabled?: string | undefined;
  readonly chainEnvironment?: string | undefined;
  readonly realTradingEnabled?: string | undefined;
  readonly realWithdrawalsEnabled?: string | undefined;
  readonly realRewardDistributionEnabled?: string | undefined;
}

export const validateEnvironmentSecurity = (input: EnvironmentSecurityInput): void => {
  if (input.executionMode === 'LIVE') throw new Error('Live execution is not enabled in Phase 5.');
  if (input.liveTransportEnabled === 'true') throw new Error('Live exchange transport is not enabled in Phase 5.');
  if (input.mainnetEnabled === 'true') throw new Error('Mainnet writes are not enabled in Phase 5.');
  if (input.chainEnvironment === 'arc-mainnet' && input.mainnetEnabled !== 'true') throw new Error('Arc mainnet write gate is closed');
  if (input.realTradingEnabled === 'true') throw new Error('Real trading is not enabled in Phase 5.');
  if (input.realWithdrawalsEnabled === 'true') throw new Error('Real withdrawals are not enabled in Phase 5.');
  if (input.realRewardDistributionEnabled === 'true') throw new Error('Real reward distribution is not enabled in Phase 5.');
  if (input.nodeEnvironment === 'production' && ['local-dev', 'mock'].includes(input.keyProvider ?? '')) throw new Error('insecure key provider in production');
  if (input.nodeEnvironment === 'production' && input.credentialProvider === 'mock') throw new Error('mock credential provider in production');
};

export interface AwsKmsKeyProvider extends KeyProvider { readonly providerType: 'aws-kms'; }
export interface GcpKmsKeyProvider extends KeyProvider { readonly providerType: 'gcp-kms'; }
export interface HsmKeyProvider extends KeyProvider { readonly providerType: 'hsm'; }
export interface MpcKeyProvider extends KeyProvider { readonly providerType: 'mpc'; }
export interface CustodyProvider extends KeyProvider { readonly providerType: 'custody'; }
