'use client';

import { XgouBrain } from '@/components/brain/XgouBrain';
import { NavChart } from '@/components/charts/NavChart';
import { FundCard } from '@/components/dashboard/FundCard';
import { IndexGauge } from '@/components/dashboard/IndexGauge';
import { RewardCard } from '@/components/dashboard/RewardCard';
import { XpCard } from '@/components/dashboard/XpCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatUsd } from '@/lib/finance';
import { getAppMode } from '@/lib/app-mode';
import { useXgouResource } from '@/hooks/useXgouResource';
import { ErrorState, LoadingState } from '@/components/ui/DataState';

export default function DashboardPage() {
  const dashboardQuery = useXgouResource('getDashboard');
  const rewardsQuery = useXgouResource('getRewards');
  const xpQuery = useXgouResource('getXp');
  if (dashboardQuery.loading || rewardsQuery.loading || xpQuery.loading) return <LoadingState/>;
  const failure = dashboardQuery.error ?? rewardsQuery.error ?? xpQuery.error;
  if (failure) return <ErrorState error={failure} retry={() => { dashboardQuery.refresh(); rewardsQuery.refresh(); xpQuery.refresh(); }}/>;
  if (!dashboardQuery.data || !rewardsQuery.data || !xpQuery.data) return <LoadingState/>;
  const dashboard = dashboardQuery.data; const rewards = rewardsQuery.data; const xp = xpQuery.data; const isDemo = getAppMode() === 'demo';
  return <>
    <PageHeader eyebrow={`AI WEALTH OPERATING SYSTEM · ${isDemo ? 'DEMO' : 'ARC TESTNET'}`} title="资产总览" description="三大独立资金域，一个统一智能层。" />
    <section className="mb-4 rounded-2xl bg-white/[.025] p-6 md:p-7"><div className="grid gap-6 md:grid-cols-[1.5fr_.8fr_.8fr] md:items-end"><div><p className="eyebrow">TOTAL PARTICIPATING PRINCIPAL · {isDemo ? 'DEMO' : 'REAL LEDGER'}</p><p className="mt-3 text-4xl font-light md:text-5xl">{formatUsd(dashboard.totalAssets)}</p></div><div><p className="eyebrow">PAPER RETURN</p><p className="mt-3 text-2xl text-[var(--success)]">{dashboard.totalReturn}%</p></div><div className="md:text-right"><p className="eyebrow">XGOU SYSTEM</p><p className="mt-3 text-[10px] tracking-[.16em] text-[var(--success)]">● ONLINE · {isDemo ? 'DEMO DATA' : 'TESTNET API'}</p></div></div></section>
    <div className="grid gap-4 md:grid-cols-3">{dashboard.funds.map((fund) => <FundCard key={fund.name} fund={fund} />)}</div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[1.3fr_.7fr]"><div className="glass overflow-hidden rounded-2xl"><XgouBrain compact /><div className="grid grid-cols-3 border-t border-white/[.05] text-center text-[9px] tracking-[.12em] text-white/45"><span className="p-4 text-[var(--red)]">BULL · ACTIVE</span><span className="p-4 text-[var(--cyan)]">SPOT · ACTIVE</span><span className="p-4 text-[var(--blue)]">FUTURES · MONITORING</span></div></div><IndexGauge value={dashboard.xgouIndex} stage={dashboard.marketStage} /></div>
    <div className="mt-4 grid gap-4 xl:grid-cols-2"><NavChart data={dashboard.navHistory} /><div className="grid gap-4 md:grid-cols-2"><RewardCard available={rewards.available} pending={rewards.pending} total={rewards.totalEarned} next={rewards.nextSettlement} /><XpCard total={xp.total} principal={xp.principal} dynamic={xp.dynamic} depth={xp.unlockedDepth} /></div></div>
  </>;
}
