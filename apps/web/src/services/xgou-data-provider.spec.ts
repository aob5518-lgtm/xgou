import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiXgouDataProvider, DemoXgouDataProvider } from './xgou-data-provider';
import { demoData } from '@/lib/demo-data';

afterEach(() => { vi.restoreAllMocks(); window.sessionStorage.clear(); });

describe('DemoXgouDataProvider', () => {
  it('serves a complete internally consistent demo dashboard', async () => {
    const provider = new DemoXgouDataProvider();
    const dashboard = await provider.getDashboard();
    expect(dashboard.funds.map((fund) => fund.allocation)).toEqual([50, 30, 20]);
    expect(dashboard.funds.reduce((sum, fund) => sum + fund.nav, 0)).toBeCloseTo(dashboard.totalAssets, 2);
    expect((await provider.getReferralTree())).toHaveLength(30);
    expect((await provider.getActivities()).length).toBeGreaterThan(3);
  });
});

describe('ApiXgouDataProvider TESTNET isolation', () => {
  it('never falls back to demo fixtures when the API is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
    const provider = new ApiXgouDataProvider('https://api.example.test/v1');
    await expect(provider.getDashboard()).rejects.toMatchObject({ code: 'API_UNAVAILABLE' });
  });

  it('renders explicit zero and empty agent state from empty API payloads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))));
    const agent = await new ApiXgouDataProvider('https://api.example.test/v1').getAgentFund();
    expect(agent.positions).toEqual([]);
    expect(agent.recentTrades).toEqual([]);
    expect(agent.spot.nav).toBe(0);
    expect(agent.status).toBe('NO_PAPER_CYCLE_DATA');
    expect(agent.totalNav).not.toBe(demoData.agent.totalNav);
  });
});
