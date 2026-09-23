import { cn } from '@/lib/utils';

export function MetricCard({ label, value, detail, className }: { readonly label: string; readonly value: string; readonly detail?: string; readonly className?: string }) {
  return <div className={cn('glass rounded-2xl p-5', className)}><p className="eyebrow">{label}</p><p className="mt-3 text-2xl font-light tracking-tight md:text-3xl">{value}</p>{detail && <p className="mt-2 text-xs text-[var(--text-secondary)]">{detail}</p>}</div>;
}
