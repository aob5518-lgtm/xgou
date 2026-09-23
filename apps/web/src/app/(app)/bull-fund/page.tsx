import { AllocationChart } from '@/components/charts/AllocationChart';
import { NavChart } from '@/components/charts/NavChart';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { IndexGauge } from '@/components/dashboard/IndexGauge';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatUsd } from '@/lib/finance';
import { getXgouDataProvider } from '@/services/xgou-data-provider';

export default async function BullFundPage() {
  const bull = await getXgouDataProvider().getBullFund();
  const metrics = [
    ['BULL NAV', formatUsd(bull.nav)], ['INITIAL CAPITAL', formatUsd(bull.initialCapital)], ['CURRENT RETURN', `+${String(bull.currentReturn)}%`],
    ['REALIZED PROFIT', formatUsd(bull.realizedProfit)], ['UNREALIZED PROFIT', formatUsd(bull.unrealizedProfit)], ['PRINCIPAL RECOVERED', formatUsd(bull.principalRecovered)],
  ] as const;
  return <><PageHeader eyebrow="LONG-TERM CYCLE ENGINE · 50%" title="Bull Fund" description="AI-assisted research and disciplined cycle allocation. Isolated from Spot and Futures capital." /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{metrics.map(([label, value]) => <MetricCard key={label} label={label} value={value} />)}</div><div className="mt-4 grid gap-4 xl:grid-cols-2"><NavChart data={bull.navHistory} color="var(--red)" title="BULL NAV" /><AllocationChart data={bull.allocation} /></div><div className="mt-4 grid gap-4 xl:grid-cols-2"><IndexGauge value={bull.xgouIndex} stage={bull.cycleStage} /><div className="glass rounded-2xl p-6"><p className="eyebrow">CYCLE POLICY</p><h2 className="mt-5 text-2xl font-light">Expansion positioning</h2><p className="mt-4 text-sm leading-7 text-white/45">Portfolio remains tilted toward BTC and ETH while preserving a stable reserve. Bull capital cannot be automatically consumed by Agent strategies.</p></div></div></>;
}
