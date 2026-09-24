export function BrainFallback({ compact = false }: { readonly compact?: boolean }) {
  return (
    <div className="relative grid h-full min-h-64 place-items-center overflow-hidden" role="img" aria-label="XGOU red and blue AI brain">
      <div className={`absolute rounded-full bg-[var(--red)] opacity-20 blur-3xl ${compact ? 'size-36' : 'size-64'} -translate-x-1/3`} />
      <div className={`absolute rounded-full bg-[var(--blue)] opacity-20 blur-3xl ${compact ? 'size-36' : 'size-64'} translate-x-1/3`} />
      <svg viewBox="0 0 420 300" className="relative h-auto w-[82%] max-w-xl" fill="none">
        <path d="M199 48C141 19 63 58 64 130c-37 21-31 86 13 99 20 50 84 55 122 14V48Z" stroke="var(--red)" strokeWidth="2" opacity=".8" />
        <path d="M221 48c58-29 136 10 135 82 37 21 31 86-13 99-20 50-84 55-122 14V48Z" stroke="var(--blue)" strokeWidth="2" opacity=".8" />
        {Array.from({ length: 28 }, (_, index) => <circle key={index} cx={72 + ((index * 47) % 275)} cy={62 + ((index * 71) % 172)} r="2.2" fill={index % 2 ? 'var(--red)' : 'var(--cyan)'} opacity=".75" />)}
        <path d="M210 58v184M168 122l32 16M220 148l28 9M158 190l42-29M220 177l40-55" stroke="white" opacity=".18" />
      </svg>
    </div>
  );
}
