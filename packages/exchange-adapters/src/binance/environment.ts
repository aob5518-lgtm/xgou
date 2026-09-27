export type BinanceEnvironment = 'TESTNET' | 'PRODUCTION';

export const BINANCE_SPOT_TESTNET_BASE_URL = 'https://testnet.binance.vision/api';
export const BINANCE_FUTURES_TESTNET_BASE_URL = 'https://demo-fapi.binance.com';

const PRODUCTION_HOSTS = new Set([
  'api.binance.com',
  'api1.binance.com',
  'api2.binance.com',
  'api3.binance.com',
  'api4.binance.com',
  'fapi.binance.com',
]);

export const assertBinanceSandboxHost = (environment: BinanceEnvironment, rawUrl: string): URL => {
  if (environment !== 'TESTNET') throw new Error('Binance production environment is forbidden in Phase 6');
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:') throw new Error('Binance sandbox transport requires HTTPS');
  if (PRODUCTION_HOSTS.has(url.hostname) || url.hostname.endsWith('.binance.com') && url.hostname !== 'demo-fapi.binance.com') {
    throw new Error('Binance production host is forbidden in sandbox mode');
  }
  if (!['testnet.binance.vision', 'demo-fapi.binance.com'].includes(url.hostname)) {
    throw new Error('Unapproved Binance sandbox host');
  }
  return url;
};

export interface BinanceSandboxGateInput {
  readonly executionMode: string | undefined;
  readonly transportEnabled: string | undefined;
  readonly environment: string | undefined;
}

export const assertBinanceSandboxGate = (input: BinanceSandboxGateInput): void => {
  if (input.executionMode !== 'SANDBOX') throw new Error('Binance sandbox requires EXECUTION_MODE=SANDBOX');
  if (input.transportEnabled !== 'true') throw new Error('Binance sandbox transport is disabled');
  if (input.environment !== 'TESTNET') throw new Error('Binance sandbox requires BINANCE_ENVIRONMENT=TESTNET');
};

export const assertNoBinanceWithdrawalPath = (path: string): void => {
  if (/withdraw|capital\/withdraw|asset\/transfer/i.test(path)) throw new Error('Withdrawal and transfer endpoints are forbidden');
};
