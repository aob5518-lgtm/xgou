import { AllocationChart } from '@/components/charts/AllocationChart';
import { NavChart } from '@/components/charts/NavChart';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { IndexGauge } from '@/components/dashboard/IndexGauge';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatUsd } from '@/lib/finance';
import { getXgouDataProvider } from '@/services/xgou-data-provider';

export default async function BullFundPage() {
  const bull = await getXgouDataProvider().getBullFund();
  return <><PageHeader eyebrow="LONG-TERM CYCLE ENGINE · 50%" title="Bull Fund" description="AI 辅助研究与纪律化周期配置，资金域与 Spot、Futures 完全隔离。" /><div className="grid gap-4 md:grid-cols-3"><MetricCard label="BULL NAV" value={formatUsd(bull.nav)} className="red-glow" /><MetricCard label="CURRENT RETURN" value={`+${String(bull.currentReturn)}%`} className="red-glow" /><MetricCard label="CYCLE STAGE" value={bull.cycleStage} className="red-glow" /></div><div className="mt-4 grid gap-4 md:grid-cols-3"><MetricCard label="REALIZED PROFIT" value={formatUsd(bull.realizedProfit)} /><MetricCard label="UNREALIZED PROFIT" value={formatUsd(bull.unrealizedProfit)} /><MetricCard label="PRINCIPAL RECOVERED" value={formatUsd(bull.principalRecovered)} /></div><div className="mt-4 grid gap-4 xl:grid-cols-2"><NavChart data={bull.navHistory} color="var(--red)" title="BULL NAV" /><AllocationChart data={bull.allocation} /></div><div className="mt-4 grid gap-4 xl:grid-cols-2"><IndexGauge value={bull.xgouIndex} stage={bull.cycleStage} /><div className="glass rounded-2xl p-6"><p className="eyebrow">CYCLE POLICY</p><h2 className="mt-5 text-2xl font-light">扩张阶段配置</h2><p className="mt-4 text-sm leading-7 text-white/45">组合继续以 BTC 与 ETH 为核心，同时保留稳定资产储备。Bull Fund 不会被 Agent 策略自动调用。</p></div></div></>;
}
