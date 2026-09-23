import { LockKeyhole } from 'lucide-react';
import { formatNumber } from '@/lib/finance';
import type { DemoData } from '@/lib/demo-data';

export function ReferralTable({ levels }: { readonly levels: DemoData['referralLevels'] }) {
  return <div className="glass overflow-hidden rounded-2xl"><div className="p-5"><p className="eyebrow">NETWORK LEVELS · 1—30</p></div><div className="max-h-[520px] overflow-auto"><table className="w-full min-w-[600px] text-left text-xs"><thead className="sticky top-0 bg-[var(--surface)] text-white/35"><tr>{['LEVEL','USERS','PRINCIPAL XP','DYNAMIC CONTRIBUTION','STATUS'].map((head) => <th key={head} className="px-5 py-3 font-normal">{head}</th>)}</tr></thead><tbody>{levels.map((level) => <tr key={level.level} className="border-t border-white/[.04] text-white/70"><td className="px-5 py-4">L{level.level}</td><td className="px-5 py-4">{level.unlocked ? level.users : '—'}</td><td className="px-5 py-4">{level.unlocked ? formatNumber(level.principalXp, 0) : '—'}</td><td className="px-5 py-4">{level.unlocked ? formatNumber(level.dynamicContribution, 0) : '—'}</td><td className="px-5 py-4">{level.unlocked ? <span className="text-[var(--success)]">UNLOCKED</span> : <span className="inline-flex items-center gap-2 text-white/25"><LockKeyhole size={12} />LOCKED</span>}</td></tr>)}</tbody></table></div></div>;
}
