'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
export function InviteLink({ value }: { readonly value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => { setCopied(false); }, 1400); };
  return <button type="button" onClick={() => { void copy(); }} className="flex w-full items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-black/20 p-4 text-left text-xs text-white/55"><span className="truncate">{value}</span>{copied ? <Check className="shrink-0 text-[var(--success)]" size={16} /> : <Copy className="shrink-0" size={16} />}</button>;
}
