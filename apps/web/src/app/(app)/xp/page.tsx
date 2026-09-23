import { MetricCard } from '@/components/dashboard/MetricCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { InviteLink } from '@/components/xp/InviteLink';
import { ReferralTable } from '@/components/xp/ReferralTable';
import { formatNumber } from '@/lib/finance';
import { getXgouDataProvider } from '@/services/xgou-data-provider';

export default async function XpPage() {
  const provider = getXgouDataProvider(); const [xp, levels] = await Promise.all([provider.getXp(), provider.getReferralTree()]);
  const metrics = [['PRINCIPAL XP', xp.principal], ['DYNAMIC XP', xp.dynamic], ['TOTAL XP', xp.total], ['DIRECT VALID REFERRALS', xp.directReferrals], ['UNLOCKED DEPTH', `${String(xp.unlockedDepth)} / 30`], ['NETWORK PRINCIPAL XP', xp.networkPrincipal]] as const;
  return <><PageHeader eyebrow="REWARD WEIGHT SYSTEM" title="XP Network" description="Principal participation plus non-recursive Dynamic XP from unlocked network levels." /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(([label, value]) => <MetricCard key={label} label={label} value={typeof value === 'number' ? formatNumber(value, 0) : value} />)}</div><div className="mt-4 grid gap-4 lg:grid-cols-2"><div className="glass rounded-2xl p-6"><p className="eyebrow">MY INVITE LINK</p><div className="mt-5"><InviteLink value={xp.inviteLink} /></div></div><div className="glass rounded-2xl p-6"><p className="eyebrow">INVITER WALLET</p><p className="mt-5 text-lg">{xp.inviter}</p><p className="mt-2 text-xs text-white/35">Bound · immutable after participation</p></div></div><div className="mt-4"><ReferralTable levels={levels} /></div></>;
}
