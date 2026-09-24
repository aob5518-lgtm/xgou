import { NavChart } from '@/components/charts/NavChart';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { WithdrawDemo } from '@/components/rewards/WithdrawDemo';
import { formatUsd } from '@/lib/finance';
import { getXgouDataProvider } from '@/services/xgou-data-provider';

export default async function RewardsPage() {
  const rewards = await getXgouDataProvider().getRewards();
  return <><PageHeader eyebrow="WEEKLY SETTLEMENT · DEMO" title="Rewards" description="仅已实现并经过风险调整的净利润，可进入分红池；当前数值均为演示数据。" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="WEEKLY REWARD" value={formatUsd(rewards.available)} className="cyan-glow" /><MetricCard label="PENDING REWARD" value={formatUsd(rewards.pending)} /><MetricCard label="TOTAL EARNED" value={formatUsd(rewards.totalEarned)} /><MetricCard label="TOTAL WITHDRAWN" value={formatUsd(rewards.totalWithdrawn)} /></div><div className="mt-4 grid gap-4 xl:grid-cols-[1.3fr_.7fr]"><NavChart data={rewards.history} title="WEEKLY REWARD HISTORY" color="var(--success)" /><WithdrawDemo available={rewards.available} /></div><div className="glass mt-4 rounded-2xl p-6"><p className="eyebrow">REWARD HISTORY · DEMO</p><div className="mt-5 divide-y divide-white/[.05]">{rewards.history.slice().reverse().map((item, index) => <div key={item.label} className="flex items-center justify-between py-4 text-sm"><span className="text-white/40">2026 · EPOCH {String(18 - index).padStart(2, '0')}</span><span>{formatUsd(item.value)}</span><span className="text-[10px] tracking-wider text-[var(--success)]">SETTLED</span></div>)}</div></div></>;
}
