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
  return <><PageHeader eyebrow="PORTFOLIO INTELLIGENCE · DEMO" title="Command overview" description="Three isolated capital domains. One unified intelligence layer." /><section className="glass mb-4 rounded-2xl p-6 md:p-8"><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow">TOTAL ASSETS</p><p className="mt-4 text-4xl font-light md:text-6xl">{formatUsd(dashboard.totalAssets)}</p></div><div className="text-right"><span className="rounded-full bg-[var(--success)]/10 px-3 py-2 text-xs text-[var(--success)]">+{dashboard.totalReturn}% TOTAL RETURN</span><p className="mt-3 text-[10px] tracking-[.16em] text-[var(--warning)]">DEMO DATA</p></div></div></section><div className="grid gap-4 md:grid-cols-3">{dashboard.funds.map((fund) => <FundCard key={fund.name} fund={fund} />)}</div><div className="mt-4 grid gap-4 xl:grid-cols-[1.3fr_.7fr]"><div className="glass overflow-hidden rounded-2xl"><XgouBrain compact /><div className="grid grid-cols-3 border-t border-[var(--border)] text-center text-[10px] tracking-[.12em] text-white/45"><span className="p-4 text-[var(--red)]">BULL · ACTIVE</span><span className="p-4 text-[var(--cyan)]">SPOT · ACTIVE</span><span className="p-4 text-[var(--blue)]">FUTURES · MONITORING</span></div></div><IndexGauge value={dashboard.xgouIndex} stage={dashboard.marketStage} /></div><div className="mt-4 grid gap-4 xl:grid-cols-2"><NavChart data={dashboard.navHistory} /><div className="grid gap-4 md:grid-cols-2"><RewardCard available={rewards.available} pending={rewards.pending} total={rewards.totalEarned} next={rewards.nextSettlement} /><XpCard total={xp.total} principal={xp.principal} dynamic={xp.dynamic} depth={xp.unlockedDepth} /></div></div></>;
}
