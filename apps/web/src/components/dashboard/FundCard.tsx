import type { FundSummary } from '@/lib/demo-data';
import { formatUsd } from '@/lib/finance';
import { cn } from '@/lib/utils';

const toneClass = { red: 'red-glow before:bg-[var(--red)]', cyan: 'cyan-glow before:bg-[var(--cyan)]', blue: 'blue-glow before:bg-[var(--blue)]' } as const;
export function FundCard({ fund }: { readonly fund: FundSummary }) {
  const index = fund.tone === 'red' ? '01' : fund.tone === 'cyan' ? '02' : '03';
  return <div className={cn('glass relative overflow-hidden rounded-2xl p-5 before:absolute before:inset-y-5 before:left-0 before:w-px', toneClass[fund.tone])}><div className="flex items-start justify-between"><div className="flex items-center gap-3"><span className="font-mono text-[9px] text-white/25">{index}</span><p className="eyebrow">{fund.name}</p></div><span className="text-sm text-white/50">{fund.allocation}%</span></div><p className="mt-8 text-3xl font-light">{formatUsd(fund.nav)}</p><p className="mt-2 text-sm text-[var(--success)]">+{fund.returnPercent}% <span className="text-white/30">收益</span></p></div>;
}
