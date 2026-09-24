import Link from 'next/link';

export function Logo({ compact = false }: { readonly compact?: boolean }) {
  return (
    <Link href="/" className="group inline-flex items-center gap-3" aria-label="XGOU home">
      <span className="relative grid size-8 place-items-center rounded-full border border-white/15 bg-white/[.04]">
        <span className="absolute left-[7px] size-2 rounded-full bg-[var(--red)]" />
        <span className="absolute right-[7px] size-2 rounded-full bg-[var(--blue)]" />
        <span className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2 scale-x-0 bg-white/40 transition-transform duration-500 group-hover:scale-x-100" />
      </span>
      {!compact && <span className="text-sm font-bold tracking-[.24em]">XGOU</span>}
    </Link>
  );
}
