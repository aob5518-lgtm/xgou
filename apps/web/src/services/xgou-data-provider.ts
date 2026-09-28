import { demoData, type DemoData } from '@/lib/demo-data';
import { apiRequest } from '@/services/auth-session';
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

const numeric = (value: unknown): number => Number(value ?? 0);
const text = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback;
const records = (value: unknown): Array<Record<string, unknown>> => Array.isArray(value) ? value as Array<Record<string, unknown>> : [];

export class ApiXgouDataProvider implements XgouDataProvider {
  constructor(private readonly baseUrl: string) {}
  private get<T>(path: string): Promise<T> { return apiRequest<T>(this.baseUrl, path); }

  async getDashboard() {
    const data = await this.get<Record<string, unknown>>('/dashboard');
    return { totalAssets: numeric(data.totalAssets), totalReturn: numeric(data.totalReturn), xgouIndex: numeric(data.xgouIndex), marketStage: text(data.marketStage, 'NOT AVAILABLE'), funds: records(data.funds).map((fund, index) => ({ name: text(fund.name), allocation: numeric(fund.allocation), nav: numeric(fund.nav), returnPercent: numeric(fund.returnPercent), tone: (['red', 'cyan', 'blue'][index] ?? 'cyan') as 'red' | 'cyan' | 'blue' })), navHistory: records(data.navHistory).map((item) => ({ label: text(item.label), value: numeric(item.value) })) } as unknown as DemoData['dashboard'];
  }

  async getBullFund() {
    const data = await this.get<Record<string, unknown>>('/dashboard/bull-fund');
    const vault = (data.vault ?? {}) as Record<string, unknown>;
    return { nav: numeric(data.allocatedPrincipal), initialCapital: numeric(data.allocatedPrincipal), currentReturn: 0, realizedProfit: 0, unrealizedProfit: 0, principalRecovered: 0, cycleStage: text(data.cycleStage, 'NOT AVAILABLE'), xgouIndex: 0, allocation: [{ label: 'USER ALLOCATION', value: 50 }, { label: 'UNALLOCATED VIEW', value: 50 }], navHistory: records(data.deposits).map((deposit, index) => ({ label: `D${String(index + 1)}`, value: numeric(deposit.bullAmount) })).reverse(), vaultAddress: text(vault.address), vaultStatus: text(vault.status, 'NOT AVAILABLE'), vaultBalanceEvidence: vault.balanceEvidence === null ? null : numeric(vault.balanceEvidence) } as unknown as DemoData['bull'];
  }

  async getAgentFund() {
    const [spot, futures] = await Promise.all([this.get<Record<string, unknown>>('/agent/spot'), this.get<Record<string, unknown>>('/agent/futures')]);
    const spotNav = numeric(spot.nav);
    return {
      mode: 'PAPER', status: text(spot.status, 'NO_PAPER_CYCLE_DATA'), circuitState: text(spot.circuitState, 'NOT AVAILABLE'), allocatedCapital: numeric(spot.allocatedCapital), activeCapital: numeric(spot.activeCapital), cashBalance: numeric(spot.cashBalance), reserveBalance: numeric(spot.reserveBalance), realizedPnl: numeric(spot.realizedPnl), unrealizedPnl: numeric(spot.unrealizedPnl), dailyPnl: numeric(spot.dailyPnl), drawdown: numeric(spot.drawdown), totalNav: spotNav,
      spot: { nav: spotNav, weeklyPnl: numeric(spot.weeklyPnl), monthlyPnl: 0, cashReserve: spotNav === 0 ? 0 : numeric(spot.reserveBalance) / spotNav * 100, exposure: spotNav === 0 ? 0 : numeric(spot.exposure) / spotNav * 100, risk: text(spot.circuitState, 'NOT AVAILABLE') },
      positions: records(spot.positions).map((position) => ({ symbol: text(position.symbol), entry: numeric(position.averageEntry), current: numeric(position.markPrice), pnlPercent: numeric(position.averageEntry) === 0 ? 0 : (numeric(position.markPrice) / numeric(position.averageEntry) - 1) * 100, allocation: spotNav === 0 ? 0 : numeric(position.marketValue) / spotNav * 100 })),
      recentTrades: records(spot.recentTrades).map((trade) => ({ id: text(trade.id), symbol: text(trade.symbol), side: text(trade.side), quantity: text(trade.quantity), price: text(trade.price), fee: text(trade.fee), executedAt: text(trade.executedAt), mode: 'PAPER' })), pnlHistory: records(spot.navHistory).map((item) => ({ label: text(item.label), value: numeric(item.value) })),
      futures: { status: text(futures.status, 'NO_PAPER_CYCLE_DATA'), circuitState: text(futures.circuitState, 'NOT AVAILABLE'), nav: numeric(futures.nav), allocatedCapital: numeric(futures.allocatedCapital), activeCapital: numeric(futures.activeCapital), reserve: numeric(futures.reserve), realizedPnl: numeric(futures.realizedPnl), unrealizedPnl: numeric(futures.unrealizedPnl), fundingPnl: numeric(futures.fundingPnl), fees: numeric(futures.fees), grossExposure: numeric(futures.grossExposure), netExposure: numeric(futures.netExposure), leverage: numeric(futures.leverage), marginUsed: numeric(futures.marginUsed), marginUsage: numeric(futures.marginUsage) * 100, drawdown: numeric(futures.drawdown), highWaterMark: numeric(futures.highWaterMark), dailyPnl: numeric(futures.dailyPnl), weeklyPnl: numeric(futures.weeklyPnl), consecutiveLosses: numeric(futures.consecutiveLosses), risk: text(futures.circuitState, 'NOT AVAILABLE'), fundingRate: numeric(futures.fundingRate), nextFunding: text(futures.nextFunding, 'N/A'), positions: records(futures.positions).map((position) => ({ symbol: text(position.symbol), side: text(position.side, 'LONG') as 'LONG' | 'SHORT', quantity: numeric(position.quantity), entry: numeric(position.entry), mark: numeric(position.mark), leverage: numeric(position.leverage), notional: numeric(position.notional), margin: numeric(position.margin), unrealizedPnl: numeric(position.unrealizedPnl), stop: numeric(position.stop), liquidationPrice: numeric(position.liquidationPrice), liquidationDistance: numeric(position.liquidationDistance) })), recentFunding: records(futures.recentFunding).map((item) => ({ id: text(item.id), symbol: text(item.symbol), fundingRate: numeric(item.fundingRate), payment: numeric(item.payment), timestamp: text(item.timestamp) })) },
    } as unknown as DemoData['agent'];
  }

  async getRewards() {
    const response = await this.get<Record<string, unknown>>('/rewards'); const epoch = response.latestFinalizedEpoch as Record<string, unknown> | null; const allocations = records(response.allocations); const mine = allocations[0];
    return { available: numeric(response.availablePaperReward), pending: numeric(response.pendingPaperReward), totalEarned: numeric(response.totalPaperEarned), totalWithdrawn: 0, nextSettlement: 'N/A', mode: 'PAPER', epoch: numeric(epoch?.number), epochStatus: text(epoch?.status, 'NO FINALIZED EPOCH'), spotNetRealized: numeric(epoch?.spotNetRealized), futuresNetRealized: numeric(epoch?.futuresNetRealized), lossCarryforward: numeric(epoch?.lossCarryforwardAfter), highWaterMark: numeric(epoch?.hwmAfter), rewardPool: numeric(epoch?.rewardPool), userXp: numeric(mine?.xp), globalXp: numeric(mine?.globalXp), shareRatio: numeric(mine?.shareRatio), grossReward: numeric(mine?.grossReward), feePreview: numeric(mine?.feePreview), netPreview: numeric(mine?.netPreview), history: allocations.map((item) => ({ label: `E${text(item.epoch)}`, value: numeric(item.grossReward) })).reverse() } as unknown as DemoData['rewards'];
  }

  async getXp() {
    const data = await this.get<Record<string, unknown>>('/xp/me'); const wallet = text(data.walletAddress);
    return { principal: numeric(data.principalXp), dynamic: numeric(data.dynamicXp), total: numeric(data.totalXp), directReferrals: numeric(data.directValidReferralCount), unlockedDepth: numeric(data.unlockedDepth), networkPrincipal: numeric(data.networkPrincipalXp), inviteLink: wallet ? `${typeof window === 'undefined' ? '' : window.location.origin}/join?ref=${wallet}` : '', inviter: text(data.inviterWalletAddress, 'Not bound'), eligibleForDynamicXp: Boolean(data.eligibleForDynamicXp), qualification: numeric(data.qualification), qualificationRemaining: numeric(data.qualificationRemaining) } as unknown as DemoData['xp'];
  }

  async getActivities() { const rows = await this.get<Array<Record<string, unknown>>>('/activities'); return rows.map((item) => ({ time: text(item.time), agent: text(item.agent), message: text(item.message), status: text(item.status) })) as unknown as DemoData['activities']; }
  async getReferralTree() { const rows = await this.get<Array<Record<string, unknown>>>('/referrals/tree'); return Array.from({ length: 30 }, (_, index) => { const depth = index + 1; const users = rows.filter((row) => numeric(row.depth) === depth).length; return { level: depth, users, principalXp: 0, dynamicContribution: 0, unlocked: users > 0 }; }) as unknown as DemoData['referralLevels']; }
}

export const getXgouDataProvider = (): XgouDataProvider => getAppMode() === 'demo' ? new DemoXgouDataProvider() : new ApiXgouDataProvider(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1');
