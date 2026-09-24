import { XgouBrain } from '@/components/brain/XgouBrain';
import { NavChart } from '@/components/charts/NavChart';
import { FundCard } from '@/components/dashboard/FundCard';
import { IndexGauge } from '@/components/dashboard/IndexGauge';
import { RewardCard } from '@/components/dashboard/RewardCard';
import { XpCard } from '@/components/dashboard/XpCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatUsd } from '@/lib/finance';
import { getXgouDataProvider } from '@/services/xgou-data-provider';

export default async function DashboardPage() {
  const provider = getXgouDataProvider();
  const [dashboard, rewards, xp] = await Promise.all([provider.getDashboard(), provider.getRewards(), provider.getXp()]);
  return <>
    <PageHeader eyebrow="AI WEALTH OPERATING SYSTEM · DEMO" title="Command overview" description="三大独立资金域，一个统一智能层。" />
    <section className="mb-4 rounded-2xl bg-white/[.025] p-6 md:p-7"><div className="grid gap-6 md:grid-cols-[1.5fr_.8fr_.8fr] md:items-end"><div><p className="eyebrow">TOTAL ASSETS · DEMO</p><p className="mt-3 text-4xl font-light md:text-5xl">{formatUsd(dashboard.totalAssets)}</p></div><div><p className="eyebrow">TOTAL RETURN</p><p className="mt-3 text-2xl text-[var(--success)]">+{dashboard.totalReturn}%</p></div><div className="md:text-right"><p className="eyebrow">XGOU SYSTEM</p><p className="mt-3 text-[10px] tracking-[.16em] text-[var(--success)]">● ONLINE · DEMO DATA</p></div></div></section>
    <div className="grid gap-4 md:grid-cols-3">{dashboard.funds.map((fund) => <FundCard key={fund.name} fund={fund} />)}</div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[1.3fr_.7fr]"><div className="glass overflow-hidden rounded-2xl"><XgouBrain compact /><div className="grid grid-cols-3 border-t border-white/[.05] text-center text-[9px] tracking-[.12em] text-white/45"><span className="p-4 text-[var(--red)]">BULL · ACTIVE</span><span className="p-4 text-[var(--cyan)]">SPOT · ACTIVE</span><span className="p-4 text-[var(--blue)]">FUTURES · MONITORING</span></div></div><IndexGauge value={dashboard.xgouIndex} stage={dashboard.marketStage} /></div>
    <div className="mt-4 grid gap-4 xl:grid-cols-2"><NavChart data={dashboard.navHistory} /><div className="grid gap-4 md:grid-cols-2"><RewardCard available={rewards.available} pending={rewards.pending} total={rewards.totalEarned} next={rewards.nextSettlement} /><XpCard total={xp.total} principal={xp.principal} dynamic={xp.dynamic} depth={xp.unlockedDepth} /></div></div>
  </>;
}
