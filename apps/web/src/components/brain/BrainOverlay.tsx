'use client';

import { motion } from 'framer-motion';

export function BrainOverlay({ compact = false }: { readonly compact?: boolean }) {
  if (compact) return <div className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-[10px] tracking-[.22em] text-white/45">XGOU CORE · AGENT ONLINE</div>;
  return (
    <div className="pointer-events-none absolute inset-0">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .6 }} className="absolute left-4 top-1/2 -translate-y-1/2 text-left md:left-8">
        <p className="text-[10px] tracking-[.2em] text-[var(--red)]">BULL FUND</p><p className="text-2xl font-light">50%</p><p className="text-[9px] tracking-[.15em] text-white/35">LONG TERM CYCLE</p>
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .75 }} className="absolute right-4 top-1/2 -translate-y-1/2 text-right md:right-8">
        <p className="text-[10px] tracking-[.2em] text-[var(--cyan)]">AGENT FUND</p><p className="text-2xl font-light">50%</p><p className="text-[9px] tracking-[.15em] text-white/35">SPOT 30 · FUTURES 20</p>
      </motion.div>
      <div className="absolute inset-x-0 bottom-2 text-center text-[9px] tracking-[.24em] text-white/35">XGOU CORE · AGENT ONLINE</div>
    </div>
  );
}
