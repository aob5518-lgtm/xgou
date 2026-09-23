import { describe, expect, it } from 'vitest';
import { DemoXgouDataProvider } from './xgou-data-provider';

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
