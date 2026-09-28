'use client';

import { NavChart } from '@/components/charts/NavChart';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { WithdrawDemo } from '@/components/rewards/WithdrawDemo';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/DataState';
import { useXgouResource } from '@/hooks/useXgouResource';
import { formatUsd } from '@/lib/finance';

export default function RewardsPage() {
  const query = useXgouResource('getRewards');
  if (query.loading) return <LoadingState/>;
  if (query.error) return <ErrorState error={query.error} retry={query.refresh}/>;
  if (!query.data) return <LoadingState/>;
  const rewards = query.data;
  const epochNumber: number = rewards.epoch;
  return <>
    <PageHeader eyebrow="WEEKLY SETTLEMENT · PAPER · NOT WITHDRAWABLE" title="Rewards" description="仅 Spot 与 Futures 已实现净利润进入 Paper Reward Pool；本金、入金与 XP 不会被当作利润。" />
    {epochNumber === 0 && <div className="mb-4"><EmptyState message="No finalized Paper Reward epoch yet."/></div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="AVAILABLE PAPER REWARD" value={formatUsd(rewards.available)} className="cyan-glow"/><MetricCard label="PENDING PAPER REWARD" value={formatUsd(rewards.pending)}/><MetricCard label="REWARD POOL" value={formatUsd(rewards.rewardPool)}/><MetricCard label="EPOCH STATUS" value={rewards.epochStatus}/></div>
    <div className="mt-4 grid gap-4 xl:grid-cols-2"><div className="glass rounded-2xl p-6"><p className="eyebrow">SETTLEMENT ACCOUNTING · EPOCH {rewards.epoch}</p><div className="mt-5 grid grid-cols-2 gap-5 text-sm"><div><p className="text-white/35">Spot Net Realized</p><p className="mt-1 text-lg">{formatUsd(rewards.spotNetRealized)}</p></div><div><p className="text-white/35">Futures Net Realized</p><p className="mt-1 text-lg">{formatUsd(rewards.futuresNetRealized)}</p></div><div><p className="text-white/35">Loss Carryforward</p><p className="mt-1">{formatUsd(rewards.lossCarryforward)}</p></div><div><p className="text-white/35">Reward HWM</p><p className="mt-1">{formatUsd(rewards.highWaterMark)}</p></div></div></div><div className="glass rounded-2xl p-6"><p className="eyebrow">FROZEN XP SNAPSHOT</p><div className="mt-5 grid grid-cols-2 gap-5 text-sm"><div><p className="text-white/35">Your XP</p><p className="mt-1 text-lg">{rewards.userXp.toLocaleString()}</p></div><div><p className="text-white/35">Global XP</p><p className="mt-1 text-lg">{rewards.globalXp.toLocaleString()}</p></div><div><p className="text-white/35">Share</p><p className="mt-1">{(rewards.shareRatio * 100).toFixed(4)}%</p></div><div><p className="text-white/35">Gross Allocation</p><p className="mt-1">{formatUsd(rewards.grossReward)}</p></div></div></div></div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[1.3fr_.7fr]"><NavChart data={rewards.history} title="PAPER REWARD HISTORY" color="var(--success)"/><WithdrawDemo available={rewards.available}/></div>
    <div className="glass mt-4 rounded-2xl border border-amber-300/10 p-5 text-xs leading-6 text-white/45"><b className="text-amber-200">PAPER ONLY</b> · 5% 仅为手续费预览。不存在真实分发、真实提现或链上写入。</div>
  </>;
}
