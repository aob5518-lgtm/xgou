'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { BrainFallback } from './BrainFallback';
import { BrainOverlay } from './BrainOverlay';

const BrainParticles = dynamic(() => import('./BrainParticles'), { ssr: false, loading: () => <BrainFallback /> });

export function XgouBrain({ compact = false }: { readonly compact?: boolean }) {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    try {
      const canvas = document.createElement('canvas');
      setWebgl(Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl')));
    } catch { setWebgl(false); }
  }, []);
  return (
    <div className={`relative overflow-hidden ${compact ? 'h-72' : 'h-[46vh] min-h-80 md:h-[58vh]'}`}>
      {webgl && !reduced ? <BrainParticles compact={compact} /> : <BrainFallback compact={compact} />}
      <BrainOverlay compact={compact} />
    </div>
  );
}
