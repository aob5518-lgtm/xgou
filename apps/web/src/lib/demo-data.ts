export interface ChartPoint { readonly label: string; readonly value: number }
export interface FundSummary { readonly name: string; readonly allocation: number; readonly nav: number; readonly returnPercent: number; readonly tone: 'red' | 'cyan' | 'blue' }
export interface ActivityItem { readonly time: string; readonly agent: string; readonly message: string; readonly status?: string }
export interface Position { readonly symbol: string; readonly entry: number; readonly current: number; readonly pnlPercent: number; readonly allocation: number }
export interface FuturesPosition { readonly symbol: string; readonly side: 'LONG' | 'SHORT'; readonly quantity: number; readonly entry: number; readonly mark: number; readonly leverage: number; readonly notional: number; readonly margin: number; readonly unrealizedPnl: number; readonly stop: number; readonly liquidationPrice: number; readonly liquidationDistance: number }

export const demoData = {
  dashboard: {
    totalAssets: 24860.42,
    totalReturn: 18.42,
    xgouIndex: 72,
    marketStage: 'BULL EXPANSION',
    funds: [
      { name: 'BULL FUND', allocation: 50, nav: 12430.21, returnPercent: 26.8, tone: 'red' },
      { name: 'SPOT STRATEGY', allocation: 30, nav: 7458.13, returnPercent: 11.4, tone: 'cyan' },
      { name: 'FUTURES TREND', allocation: 20, nav: 4972.08, returnPercent: 8.7, tone: 'blue' },
    ] satisfies readonly FundSummary[],
    navHistory: [
      { label: 'APR', value: 20140 }, { label: 'MAY', value: 20890 }, { label: 'JUN', value: 21620 },
      { label: 'JUL', value: 22940 }, { label: 'AUG', value: 23510 }, { label: 'SEP', value: 24860.42 },
    ] satisfies readonly ChartPoint[],
  },
  bull: {
    nav: 12430.21, initialCapital: 9800, currentReturn: 26.8, realizedProfit: 1124.42,
    unrealizedProfit: 1505.79, principalRecovered: 1800, cycleStage: 'EXPANSION', xgouIndex: 72,
    allocation: [
      { label: 'BTC', value: 42 }, { label: 'ETH', value: 24 }, { label: 'Growth', value: 14 },
      { label: 'Alpha', value: 8 }, { label: 'Stable', value: 12 },
    ] satisfies readonly ChartPoint[],
    navHistory: [
      { label: 'W1', value: 11020 }, { label: 'W2', value: 11310 }, { label: 'W3', value: 11240 },
      { label: 'W4', value: 11780 }, { label: 'W5', value: 12040 }, { label: 'W6', value: 12430.21 },
    ] satisfies readonly ChartPoint[],
  },
  agent: {
    mode: 'PAPER', status: 'PAPER', circuitState: 'RUNNING',
    allocatedCapital: 7458.13, activeCapital: 5966.5, cashBalance: 2833.13, reserveBalance: 1491.63,
    realizedPnl: 432.74, unrealizedPnl: 136.2, dailyPnl: 24.18, drawdown: 0.032,
    totalNav: 12430.21,
    spot: { nav: 7458.13, weeklyPnl: 2.41, monthlyPnl: 7.82, cashReserve: 20, exposure: 62, risk: 'MEDIUM' },
    futures: {
      status: 'PAPER', circuitState: 'RUNNING', nav: 2008.72, allocatedCapital: 2000, activeCapital: 1300, reserve: 700,
      realizedPnl: 6.42, unrealizedPnl: 3.18, fundingPnl: -0.24, fees: 0.64, grossExposure: 520, netExposure: 520,
      leverage: 2, marginUsed: 260, marginUsage: 12.94, drawdown: -0.004, highWaterMark: 2016.8, dailyPnl: 3.2, weeklyPnl: 8.72,
      consecutiveLosses: 0, risk: 'CONTROLLED', fundingRate: 0.0001, nextFunding: '06H 18M',
      positions: [{ symbol: 'BTC/USDC-PERP', side: 'LONG', quantity: 0.00462, entry: 108420, mark: 112680, leverage: 2, notional: 520, margin: 260, unrealizedPnl: 19.68, stop: 105200, liquidationPrice: 55836.3, liquidationDistance: 0.5045 }] satisfies readonly FuturesPosition[],
      recentFunding: [{ id: 'funding-1', symbol: 'BTC/USDC-PERP', fundingRate: 0.0001, payment: -0.052, timestamp: '2026-09-25T00:00:00.000Z' }],
    },
    positions: [
      { symbol: 'BTC', entry: 108420, current: 112680, pnlPercent: 3.93, allocation: 18 },
      { symbol: 'ETH', entry: 4320, current: 4458, pnlPercent: 3.19, allocation: 14 },
      { symbol: 'SOL', entry: 218.4, current: 224.7, pnlPercent: 2.88, allocation: 9 },
    ] satisfies readonly Position[],
    pnlHistory: [
      { label: 'MON', value: 24 }, { label: 'TUE', value: 48 }, { label: 'WED', value: 37 },
      { label: 'THU', value: 84 }, { label: 'FRI', value: 112 }, { label: 'SAT', value: 104 }, { label: 'SUN', value: 136 },
    ] satisfies readonly ChartPoint[],
    recentTrades: [
      { id: 'paper-1', symbol: 'BTC/USDC', side: 'BUY', quantity: '0.0162', price: '112680', fee: '1.83', executedAt: '2026-09-25T02:38:22.000Z', mode: 'PAPER' },
      { id: 'paper-2', symbol: 'ETH/USDC', side: 'BUY', quantity: '0.31', price: '4458', fee: '1.38', executedAt: '2026-09-24T18:22:41.000Z', mode: 'PAPER' },
    ],
  },
  rewards: {
    available: 382.41, pending: 124.82, totalEarned: 2864.2, totalWithdrawn: 2356.97, nextSettlement: '04D 12H',
    history: [
      { label: 'W1', value: 288 }, { label: 'W2', value: 314 }, { label: 'W3', value: 301 },
      { label: 'W4', value: 348 }, { label: 'W5', value: 365 }, { label: 'W6', value: 382.41 },
    ] satisfies readonly ChartPoint[],
  },
  xp: {
    principal: 100000, dynamic: 28450, total: 128450, directReferrals: 6, unlockedDepth: 18,
    networkPrincipal: 2845000, inviteLink: 'https://xgou.ai/join?ref=0x71F4...A92C', inviter: '0xA841...7E21',
  },
  activities: [
    { time: '12:41:08', agent: 'Risk Agent', message: 'Market volatility increased.', status: 'RISK LEVEL: MEDIUM' },
    { time: '12:38:22', agent: 'Spot Agent', message: 'Reduced BTC exposure by 8%.', status: 'EXECUTED' },
    { time: '12:22:41', agent: 'Research Agent', message: 'Detected increasing stablecoin inflow.', status: 'SIGNAL LOGGED' },
    { time: '11:58:16', agent: 'Futures Trend Agent', message: 'BTC trend signal detected.', status: 'MONITORING' },
    { time: '11:42:09', agent: 'Treasury', message: 'Liquidity reserves verified across all fund domains.', status: 'BALANCED' },
  ] satisfies readonly ActivityItem[],
  referralLevels: Array.from({ length: 30 }, (_, index) => ({
    level: index + 1,
    users: index < 18 ? Math.max(2, 42 - index * 2) : 0,
    principalXp: index < 18 ? Math.max(12000, 186000 - index * 8400) : 0,
    dynamicContribution: index < 18 ? Math.max(120, 1860 - index * 84) : 0,
    unlocked: index < 18,
  })),
} as const;

export type DemoData = typeof demoData;
