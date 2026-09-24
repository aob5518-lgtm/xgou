import { demoData, type DemoData } from '@/lib/demo-data';
import { getAccessToken } from '@/services/auth-session';
import { getAppMode } from '@/lib/app-mode';

export interface XgouDataProvider {
  getDashboard(): Promise<DemoData['dashboard']>;
  getBullFund(): Promise<DemoData['bull']>;
  getAgentFund(): Promise<DemoData['agent']>;
  getRewards(): Promise<DemoData['rewards']>;
  getXp(): Promise<DemoData['xp']>;
  getActivities(): Promise<DemoData['activities']>;
  getReferralTree(): Promise<DemoData['referralLevels']>;
}

export class DemoXgouDataProvider implements XgouDataProvider {
  async getDashboard() { return Promise.resolve(demoData.dashboard); }
  async getBullFund() { return Promise.resolve(demoData.bull); }
  async getAgentFund() { return Promise.resolve(demoData.agent); }
  async getRewards() { return Promise.resolve(demoData.rewards); }
  async getXp() { return Promise.resolve(demoData.xp); }
  async getActivities() { return Promise.resolve(demoData.activities); }
  async getReferralTree() { return Promise.resolve(demoData.referralLevels); }
}

export class ApiXgouDataProvider implements XgouDataProvider {
  constructor(private readonly baseUrl: string) {}

  private async get<T>(path: string): Promise<T> {
    const accessToken = getAccessToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      credentials: 'include',
      headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
    });
    if (!response.ok) throw new Error(`XGOU API request failed: ${String(response.status)}`);
    return response.json() as Promise<T>;
  }

  getDashboard() { return this.get<DemoData['dashboard']>('/dashboard'); }
  getBullFund() { return this.get<DemoData['bull']>('/funds/bull'); }
  getAgentFund() { return this.get<DemoData['agent']>('/funds/agent'); }
  getRewards() { return this.get<DemoData['rewards']>('/rewards'); }
  getXp() { return this.get<DemoData['xp']>('/xp/me'); }
  getActivities() { return this.get<DemoData['activities']>('/activities'); }
  getReferralTree() { return this.get<DemoData['referralLevels']>('/referrals/tree'); }
}

export const getXgouDataProvider = (): XgouDataProvider => {
  return getAppMode() === 'demo'
    ? new DemoXgouDataProvider()
    : new ApiXgouDataProvider(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1');
};
