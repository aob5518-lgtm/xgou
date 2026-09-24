export type AppMode = 'demo' | 'testnet' | 'production';

export function getAppMode(): AppMode {
  const configured = process.env.NEXT_PUBLIC_APP_MODE;
  if (configured === 'demo' || configured === 'testnet' || configured === 'production') return configured;
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'false' ? 'testnet' : 'demo';
}
