import { MetricCard } from '@/components/dashboard/MetricCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { InviteLink } from '@/components/xp/InviteLink';
import { ReferralTable } from '@/components/xp/ReferralTable';
import { formatNumber } from '@/lib/finance';
import { getXgouDataProvider } from '@/services/xgou-data-provider';

export default async function XpPage() {
  const provider = getXgouDataProvider(); const [xp, levels] = await Promise.all([provider.getXp(), provider.getReferralTree()]);
  const principalShare = Math.round((xp.principal / xp.total) * 100);
  return <><PageHeader eyebrow="REWARD WEIGHT SYSTEM" title="XP Network" description="本金参与与已解锁网络层级共同形成 XP 权重。" /><section className="glass rounded-2xl p-6 md:p-8"><p className="eyebrow">TOTAL XP</p><p className="mt-3 text-5xl font-light md:text-7xl">{formatNumber(xp.total, 0)}</p><div className="mt-7 flex h-1.5 overflow-hidden rounded-full bg-white/5"><i className="bg-white/70" style={{ width: `${String(principalShare)}%` }} /><i className="flex-1 bg-[var(--cyan)]" /></div><div className="mt-3 flex justify-between text-[10px] tracking-[.12em] text-white/40"><span>{principalShare}% PRINCIPAL</span><span>{100 - principalShare}% DYNAMIC</span></div></section><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="PRINCIPAL XP" value={formatNumber(xp.principal, 0)} /><MetricCard label="DYNAMIC XP" value={formatNumber(xp.dynamic, 0)} /><MetricCard label="DIRECT VALID REFERRALS" value={formatNumber(xp.directReferrals, 0)} /><MetricCard label="NETWORK PRINCIPAL XP" value={formatNumber(xp.networkPrincipal, 0)} /></div><div className="mt-4 grid gap-4 lg:grid-cols-2"><div className="glass rounded-2xl p-6"><p className="eyebrow">MY INVITE LINK</p><div className="mt-5"><InviteLink value={xp.inviteLink} /></div></div><div className="glass rounded-2xl p-6"><p className="eyebrow">INVITER WALLET</p><p className="mt-5 text-lg">{xp.inviter}</p><p className="mt-2 text-xs text-white/35">已绑定 · 参与后不可修改</p></div></div><div className="mt-4"><ReferralTable levels={levels} /></div></>;
}
