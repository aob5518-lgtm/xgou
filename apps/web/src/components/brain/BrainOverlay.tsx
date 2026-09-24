'use client';

import { motion } from 'framer-motion';
import type { BrainFocus } from './BrainParticles';

export function BrainOverlay({ compact = false, focus = null }: { readonly compact?: boolean; readonly focus?: BrainFocus }) {
  if (compact) return <div className="pointer-events-none absolute inset-x-0 bottom-4 text-center"><p className="text-[9px] tracking-[.22em] text-white/35">XGOU CORE</p><p className="mt-1 text-[9px] tracking-[.18em] text-[var(--success)]">● SYSTEM ONLINE</p></div>;
  return <div className="pointer-events-none absolute inset-0"><motion.div animate={{ opacity: focus === 'right' ? .28 : 1, x: focus === 'left' ? 6 : 0 }} className="brain-hud absolute left-0 top-1/2 -translate-y-1/2 text-left md:left-4"><p className="text-[9px] tracking-[.2em] text-[var(--red)]">BULL FUND</p><p className="mt-1 text-3xl font-light">50%</p><p className="mt-1 text-[8px] tracking-[.14em] text-white/35">CYCLE ALLOCATION</p></motion.div><motion.div animate={{ opacity: focus === 'left' ? .28 : 1, x: focus === 'right' ? -6 : 0 }} className="brain-hud absolute right-0 top-1/2 -translate-y-1/2 text-right md:right-4"><p className="text-[9px] tracking-[.2em] text-[var(--cyan)]">AGENT FUND</p><p className="mt-1 text-3xl font-light">50%</p><p className="mt-1 text-[8px] tracking-[.14em] text-[var(--cyan)]">SPOT 30%</p><p className="mt-1 text-[8px] tracking-[.14em] text-[var(--blue)]">FUTURES 20%</p></motion.div><motion.div animate={{ opacity: focus === 'core' ? 1 : .55, scale: focus === 'core' ? 1.04 : 1 }} className="absolute inset-x-0 bottom-10 text-center md:bottom-8"><p className="text-[9px] tracking-[.26em] text-white/45">XGOU CORE</p><p className="mt-2 text-[9px] tracking-[.18em] text-[var(--success)]">● AGENT ONLINE</p></motion.div></div>;
}
