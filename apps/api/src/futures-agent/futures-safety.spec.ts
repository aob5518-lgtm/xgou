import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { LivePerpExchangeAdapter } from '@xgou/exchange-adapters';

const serviceUrl = new URL('./futures-agent.service.ts', import.meta.url);
const workerUrl = new URL('./futures-agent.worker.ts', import.meta.url);

describe('Phase 3B futures paper safety', () => {
  it('contains no vault write, withdrawal, bridge, swap, approval, private signing or authenticated order transport', async () => {
    const source = await readFile(serviceUrl, 'utf8');
    expect(source).not.toMatch(/withdrawToTreasury|FuturesVault|approve\(|bridge\(|swap\(|apiKey|secretKey|privateKey|signature|order\/place/i);
  });

  it('uses a futures-specific distributed lock and persistent cycle idempotency', async () => {
    const [worker, service] = await Promise.all([readFile(workerUrl, 'utf8'), readFile(serviceUrl, 'utf8')]);
    expect(worker).toContain('xgou:futures-agent:cycle-lock');
    expect(worker).not.toContain('xgou:spot-agent:cycle-lock');
    expect(service).toContain('strategyId_cycleId');
    expect(service).toContain('idempotencyKey');
  });

  it('refuses a live perp adapter regardless of environment gates', () => {
    process.env.REAL_TRADING_ENABLED = 'true';
    expect(() => new LivePerpExchangeAdapter()).toThrow('Phase 3B paper only');
    process.env.REAL_TRADING_ENABLED = 'false';
  });

  it('keeps paper Futures, real trading, withdrawals and mainnet disabled by default', async () => {
    const env = await readFile(new URL('../../../../.env.example', import.meta.url), 'utf8');
    expect(env).toContain('FUTURES_PAPER_TRADING_ENABLED=false');
    expect(env).toContain('REAL_TRADING_ENABLED=false');
    expect(env).toContain('REAL_WITHDRAWALS_ENABLED=false');
    expect(env).toContain('MAINNET_ENABLED=false');
  });
});
