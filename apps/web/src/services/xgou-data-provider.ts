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
  async getAgentFund() {
    const [data, futuresData] = await Promise.all([
      this.get<Record<string, unknown>>('/agent/spot'),
      this.get<Record<string, unknown>>('/agent/futures'),
    ]);
    const numeric = (key: string): number => Number(data[key] ?? 0);
    const text = (value: unknown, fallback: string): string => typeof value === 'string' ? value : fallback;
    const positions = Array.isArray(data.positions) ? data.positions as Array<Record<string, unknown>> : [];
    const recentTrades = Array.isArray(data.recentTrades) ? data.recentTrades as unknown as DemoData['agent']['recentTrades'] : demoData.agent.recentTrades;
    const futuresNumeric = (key: string): number => Number(futuresData[key] ?? 0);
    const futuresPositions = Array.isArray(futuresData.positions) ? futuresData.positions as Array<Record<string, unknown>> : [];
    const recentFunding = Array.isArray(futuresData.recentFunding) ? futuresData.recentFunding as Array<Record<string, unknown>> : [];
    return {
      ...demoData.agent,
      mode: 'PAPER' as const,
      status: text(data.status, 'DRAFT'),
      circuitState: text(data.circuitState, 'RUNNING'),
      allocatedCapital: numeric('allocatedCapital'), activeCapital: numeric('activeCapital'),
      cashBalance: numeric('cashBalance'), reserveBalance: numeric('reserveBalance'),
      realizedPnl: numeric('realizedPnl'), unrealizedPnl: numeric('unrealizedPnl'), dailyPnl: numeric('dailyPnl'), drawdown: numeric('drawdown'),
      spot: { ...demoData.agent.spot, nav: numeric('nav'), exposure: numeric('nav') === 0 ? 0 : numeric('exposure') / numeric('nav') * 100, risk: text(data.circuitState, 'RUNNING') },
      positions: positions.map((position) => ({ symbol: text(position.symbol, ''), entry: Number(position.averageEntry ?? 0), current: Number(position.markPrice ?? 0), pnlPercent: Number(position.averageEntry ?? 0) === 0 ? 0 : (Number(position.markPrice ?? 0) / Number(position.averageEntry ?? 1) - 1) * 100, allocation: numeric('nav') === 0 ? 0 : Number(position.marketValue ?? 0) / numeric('nav') * 100 })),
      recentTrades,
      futures: {
        ...demoData.agent.futures,
        status: text(futuresData.status, 'DRAFT'), circuitState: text(futuresData.circuitState, 'RUNNING'),
        nav: futuresNumeric('nav'), allocatedCapital: futuresNumeric('allocatedCapital'), activeCapital: futuresNumeric('activeCapital'), reserve: futuresNumeric('reserve'),
        realizedPnl: futuresNumeric('realizedPnl'), unrealizedPnl: futuresNumeric('unrealizedPnl'), fundingPnl: futuresNumeric('fundingPnl'), fees: futuresNumeric('fees'),
        grossExposure: futuresNumeric('grossExposure'), netExposure: futuresNumeric('netExposure'), marginUsed: futuresNumeric('marginUsed'), marginUsage: futuresNumeric('marginUsage') * 100, leverage: futuresNumeric('leverage'), fundingRate: futuresNumeric('fundingRate'),
        drawdown: futuresNumeric('drawdown'), highWaterMark: futuresNumeric('highWaterMark'), dailyPnl: futuresNumeric('dailyPnl'), weeklyPnl: futuresNumeric('weeklyPnl'), consecutiveLosses: futuresNumeric('consecutiveLosses'),
        risk: text(futuresData.circuitState, 'RUNNING'),
        positions: futuresPositions.map((position) => ({ symbol: text(position.symbol, ''), side: text(position.side, 'LONG') as 'LONG' | 'SHORT', quantity: Number(position.quantity ?? 0), entry: Number(position.entry ?? 0), mark: Number(position.mark ?? 0), leverage: Number(position.leverage ?? 0), notional: Number(position.notional ?? 0), margin: Number(position.margin ?? 0), unrealizedPnl: Number(position.unrealizedPnl ?? 0), stop: Number(position.stop ?? 0), liquidationPrice: Number(position.liquidationPrice ?? 0), liquidationDistance: Number(position.liquidationDistance ?? 0) })),
        recentFunding: recentFunding.map((item) => ({ id: text(item.id, ''), symbol: text(item.symbol, ''), fundingRate: Number(item.fundingRate ?? 0), payment: Number(item.payment ?? 0), timestamp: text(item.timestamp, '') })),
      },
    } as unknown as DemoData['agent'];
  }
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
