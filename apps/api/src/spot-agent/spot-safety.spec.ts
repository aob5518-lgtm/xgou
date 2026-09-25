import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const serviceUrl = new URL('./spot-agent.service.ts', import.meta.url);

describe('Phase 3A fund safety', () => {
  it('contains no SpotVault write, withdrawal, swap or authenticated exchange call', async () => {
    const source = await readFile(serviceUrl, 'utf8');
    expect(source).not.toMatch(/withdrawToTreasury|SpotVault|swap\(|apiKey|secretKey/i);
  });

  it('keeps real trading, withdrawals and mainnet disabled by repository defaults', async () => {
    const env = await readFile(new URL('../../../../.env.example', import.meta.url), 'utf8');
    expect(env).toContain('REAL_TRADING_ENABLED=false');
    expect(env).toContain('REAL_WITHDRAWALS_ENABLED=false');
    expect(env).toContain('MAINNET_ENABLED=false');
  });
});
