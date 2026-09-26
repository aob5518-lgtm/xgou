'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import type { BrainFocus } from './BrainParticles';
import { BrainFallback } from './BrainFallback';
import { BrainOverlay } from './BrainOverlay';

const BrainParticles = dynamic(() => import('./BrainParticles'), { ssr: false, loading: () => <BrainFallback /> });
const animatedBrainEnabled = process.env.NEXT_PUBLIC_ENABLE_WEBGL_BRAIN === 'true';

export function XgouBrain({ compact = false }: { readonly compact?: boolean }) {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [reduced, setReduced] = useState(false);
  const [focus, setFocus] = useState<BrainFocus>(null);
  useEffect(() => {
    if (!animatedBrainEnabled) {
      setWebgl(false);
      return;
    }
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    try { const canvas = document.createElement('canvas'); setWebgl(Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))); } catch { setWebgl(false); }
  }, []);
  return <div className={`brain-stage relative overflow-hidden ${compact ? 'h-72' : 'h-[55vh] min-h-[390px] md:h-[64vh] md:min-h-[520px]'}`} onPointerMove={(event) => { if (compact) return; const bounds = event.currentTarget.getBoundingClientRect(); const x = (event.clientX - bounds.left) / bounds.width; setFocus(x < .42 ? 'left' : x > .58 ? 'right' : 'core'); }} onPointerLeave={() => { setFocus(null); }}>
    {webgl && !reduced ? <BrainParticles compact={compact} focus={focus} /> : <BrainFallback compact={compact} />}<BrainOverlay compact={compact} focus={focus} />
  </div>;
}
