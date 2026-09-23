import Link from 'next/link';

export function Logo({ compact = false }: { readonly compact?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-3" aria-label="XGOU home">
      <span className="relative grid size-8 place-items-center rounded-full border border-white/15 bg-white/[.04]">
        <span className="absolute left-[7px] size-2 rounded-full bg-[var(--red)]" />
        <span className="absolute right-[7px] size-2 rounded-full bg-[var(--blue)]" />
      </span>
      {!compact && <span className="text-sm font-bold tracking-[.24em]">XGOU</span>}
    </Link>
  );
}
