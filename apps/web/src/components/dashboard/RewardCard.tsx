import { formatUsd } from '@/lib/finance';

export function RewardCard({ available, pending, total, next }: { readonly available: number; readonly pending: number; readonly total: number; readonly next: string }) {
  return <div className="glass rounded-2xl p-6"><div className="flex justify-between"><p className="eyebrow">WEEKLY REWARD</p><span className="rounded-full bg-[var(--success)]/10 px-2 py-1 text-[9px] tracking-wider text-[var(--success)]">DEMO</span></div><p className="mt-6 text-4xl font-light">{formatUsd(available)}</p><div className="mt-7 grid grid-cols-3 gap-3 border-t border-[var(--border)] pt-5 text-xs"><div><p className="text-white/35">Pending</p><p className="mt-1">{formatUsd(pending)}</p></div><div><p className="text-white/35">Total</p><p className="mt-1">{formatUsd(total)}</p></div><div><p className="text-white/35">Settlement</p><p className="mt-1 text-[var(--cyan)]">{next}</p></div></div></div>;
}
