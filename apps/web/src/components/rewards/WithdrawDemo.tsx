'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { calculateRewardWithdrawal, formatNumber } from '@/lib/finance';

export function WithdrawDemo({ available }: { readonly available: number }) {
  const [amount, setAmount] = useState('1000');
  const [complete, setComplete] = useState(false);
  const calculation = useMemo(() => { try { return calculateRewardWithdrawal(amount); } catch { return calculateRewardWithdrawal(0); } }, [amount]);
  return <div className="glass rounded-2xl p-6"><p className="eyebrow">REWARD WITHDRAW · DEMO</p><label className="mt-6 block text-xs text-white/45">提现金额</label><div className="mt-2 flex items-center rounded-xl border border-white/[.08] bg-black/20 px-4"><input aria-label="Withdrawal Amount" value={amount} onChange={(event) => { setAmount(event.target.value.replace(/[^0-9.]/g, '')); setComplete(false); }} className="h-14 min-w-0 flex-1 bg-transparent text-xl outline-none" /><span className="text-xs text-white/35">USDC</span></div><div className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><span className="text-white/40">5% Ecosystem Fee</span><span>{formatNumber(calculation.fee.toFixed(2))} USDC</span></div><div className="flex justify-between border-t border-white/[.06] pt-3"><span className="text-white/40">实际接收</span><strong>{formatNumber(calculation.receive.toFixed(2))} USDC</strong></div></div><Button variant="outline" className="mt-6 w-full bg-white/[.025]" onClick={() => { setComplete(true); }} disabled={calculation.amount.lte(0) || calculation.amount.gt(available)}>CONFIRM DEMO</Button>{complete && <div role="status" className="mt-4 rounded-xl border border-[var(--cyan)]/25 bg-[var(--cyan)]/5 p-4 text-center text-xs text-[var(--cyan)]"><b>DEMO TRANSACTION</b><br /><span className="text-white/45">不会移动任何真实资金。</span></div>}</div>;
}
