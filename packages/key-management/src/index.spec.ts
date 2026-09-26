import { describe, expect, it } from 'vitest';
import {
  assertTradeOnlyCredential, DisabledKeyProvider, LocalDevKeyProvider, MockCredentialProvider,
  MockKeyProvider, validateEnvironmentSecurity,
} from './index.js';

describe('Phase 5 key and credential safety', () => {
  it('never exposes a raw key and returns only a short-lived signer reference', async () => {
    const provider = new MockKeyProvider();
    const signer = await provider.getSigner({ environment: 'test', purpose: 'DRY_RUN', principalReference: 'kms://xgou/test/executor' });
    expect(signer.keyReference).toBe('kms://xgou/test/executor');
    expect(Object.keys(signer)).not.toContain('privateKey');
  });
  it('keeps disabled providers fail closed', async () => {
    await expect(new DisabledKeyProvider().getSigner()).rejects.toThrow('disabled');
  });
  it('forbids local development key provider in production', () => {
    expect(() => new LocalDevKeyProvider('production')).toThrow('forbidden');
  });
  it('serializes references and metadata but not opaque credentials', async () => {
    const provider = new MockCredentialProvider(new Map([['vault://exchange/test/spot', {
      metadata: { exchange: 'fixture', environment: 'test', permissions: ['READ', 'SPOT_TRADE'] },
      opaque: { token: 'not-serializable' },
    }]]));
    const handle = await provider.resolve('vault://exchange/test/spot');
    expect(JSON.stringify(handle)).not.toContain('not-serializable');
  });
  it('rejects credentials with withdrawal permission', () => {
    expect(() => { assertTradeOnlyCredential({ exchange: 'fixture', environment: 'production', permissions: ['SPOT_TRADE', 'WITHDRAW'] }); }).toThrow('withdraw-enabled');
  });
  it('enforces Phase 5 live, transport, mainnet and production provider gates', () => {
    expect(() => { validateEnvironmentSecurity({ executionMode: 'LIVE' }); }).toThrow('Live execution');
    expect(() => { validateEnvironmentSecurity({ liveTransportEnabled: 'true' }); }).toThrow('transport');
    expect(() => { validateEnvironmentSecurity({ mainnetEnabled: 'true' }); }).toThrow('Mainnet');
    expect(() => { validateEnvironmentSecurity({ chainEnvironment: 'arc-mainnet', mainnetEnabled: 'false' }); }).toThrow('gate is closed');
    expect(() => { validateEnvironmentSecurity({ realTradingEnabled: 'true' }); }).toThrow('Real trading');
    expect(() => { validateEnvironmentSecurity({ nodeEnvironment: 'production', keyProvider: 'local-dev' }); }).toThrow('insecure key provider');
  });
});
