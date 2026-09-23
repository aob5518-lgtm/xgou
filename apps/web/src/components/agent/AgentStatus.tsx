export function AgentStatus({ name, status, detail }: { readonly name: string; readonly status: string; readonly detail: string }) {
  return <div className="flex items-center justify-between border-b border-white/[.05] py-4 last:border-0"><div><p className="text-sm">{name}</p><p className="mt-1 text-xs text-white/35">{detail}</p></div><span className="text-[9px] tracking-[.14em] text-[var(--success)]">● {status}</span></div>;
}
