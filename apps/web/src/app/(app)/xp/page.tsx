'use client';

import { MetricCard } from '@/components/dashboard/MetricCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorState, LoadingState } from '@/components/ui/DataState';
import { InviteLink } from '@/components/xp/InviteLink';
import { ReferralTable } from '@/components/xp/ReferralTable';
import { useXgouResource } from '@/hooks/useXgouResource';
import type { DemoData } from '@/lib/demo-data';
import { formatNumber } from '@/lib/finance';
import { getAppMode } from '@/lib/app-mode';

type ExtendedXp = DemoData['xp'] & { readonly eligibleForDynamicXp?: boolean; readonly qualification?: number; readonly qualificationRemaining?: number };

export default function XpPage() {
  const xpQuery = useXgouResource('getXp');
  const levelsQuery = useXgouResource('getReferralTree');
  if (xpQuery.loading || levelsQuery.loading) return <LoadingState/>;
  const failure = xpQuery.error ?? levelsQuery.error;
  if (failure) return <ErrorState error={failure} retry={() => { xpQuery.refresh(); levelsQuery.refresh(); }}/>;
  if (!xpQuery.data || !levelsQuery.data) return <LoadingState/>;
  const xp = xpQuery.data as ExtendedXp; const levels = levelsQuery.data; const demo = getAppMode() === 'demo';
  const totalXp: number = xp.total;
  const principalShare = totalXp === 0 ? 0 : Math.round((xp.principal / totalXp) * 100);
  return <>
    <PageHeader eyebrow="REWARD WEIGHT SYSTEM" title="XP Network" description="本金参与与已解锁网络层级共同形成 XP 权重。"/>
    <section className="glass rounded-2xl p-6 md:p-8"><div className="grid gap-8 md:grid-cols-[1.35fr_.65fr] md:items-end"><div><p className="eyebrow">TOTAL XP</p><p className="mt-3 text-5xl font-light md:text-7xl">{formatNumber(xp.total, 0)}</p><div className="mt-7 flex h-1.5 overflow-hidden rounded-full bg-white/5"><i className="bg-white/70" style={{ width: `${String(principalShare)}%` }}/><i className="flex-1 bg-[var(--cyan)]"/></div><div className="mt-3 flex justify-between text-[10px] tracking-[.12em] text-white/40"><span>{principalShare}% PRINCIPAL</span><span>{100 - principalShare}% DYNAMIC</span></div></div><div className="border-t border-white/[.06] pt-6 md:border-l md:border-t-0 md:pl-7 md:pt-0"><p className="eyebrow">GLOBAL XP SHARE</p><p className="mt-3 text-3xl font-light text-[var(--cyan)]">{demo ? '0.1284%' : 'N/A'}</p><p className="mt-3 text-xs leading-6 text-white/40">你的 XP 占全网有效 XP 的比例决定 Agent 周收益分配权重。</p>{demo && <span className="mt-3 inline-block text-[8px] tracking-[.14em] text-white/25">DEMO EXAMPLE</span>}</div></div></section>
    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="PRINCIPAL XP" value={formatNumber(xp.principal, 0)}/><MetricCard label="DYNAMIC XP" value={formatNumber(xp.dynamic, 0)}/><MetricCard label="DIRECT VALID REFERRALS" value={formatNumber(xp.directReferrals, 0)}/><MetricCard label="NETWORK PRINCIPAL XP" value={formatNumber(xp.networkPrincipal, 0)}/></div>
    {!demo && <div className="glass mt-4 rounded-2xl p-5 text-sm"><span className={xp.eligibleForDynamicXp ? 'text-[var(--success)]' : 'text-amber-200'}>{xp.eligibleForDynamicXp ? 'ELIGIBLE' : `Need ${formatNumber(xp.qualificationRemaining ?? 0)} USDC more`}</span><span className="ml-3 text-white/40">邀请门槛 {formatNumber(xp.qualification ?? 100)} USDC effective participation · Unlocked depth {xp.unlockedDepth}/30</span></div>}
    <div className="mt-4 grid gap-4 lg:grid-cols-2"><div className="glass rounded-2xl p-6"><p className="eyebrow">MY INVITE LINK</p><div className="mt-5"><InviteLink value={xp.inviteLink}/></div></div><div className="glass rounded-2xl p-6"><p className="eyebrow">INVITER WALLET</p><p className="mt-5 break-all text-lg">{xp.inviter}</p><p className="mt-2 text-xs text-white/35">邀请关系永久绑定，不可修改</p></div></div>
    <div className="mt-4"><ReferralTable levels={levels}/></div>
  </>;
}
