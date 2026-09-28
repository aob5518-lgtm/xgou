'use client';

import { Button } from './Button';

export function LoadingState() { return <div role="status" className="glass animate-pulse rounded-2xl p-8"><div className="h-3 w-36 rounded bg-white/10"/><div className="mt-5 h-10 w-2/3 rounded bg-white/[.06]"/><div className="mt-8 grid gap-3 sm:grid-cols-3"><i className="h-24 rounded-xl bg-white/[.04]"/><i className="h-24 rounded-xl bg-white/[.04]"/><i className="h-24 rounded-xl bg-white/[.04]"/></div><span className="sr-only">Loading</span></div>; }

export function ErrorState({ error, retry }: { readonly error: Error; readonly retry: () => void }) { return <div role="alert" className="glass rounded-2xl border border-red-400/20 p-8 text-center"><p className="eyebrow text-red-300">DATA TEMPORARILY UNAVAILABLE</p><p className="mt-4 text-sm text-white/55">{error.message}</p><Button className="mt-6" variant="outline" onClick={retry}>刷新</Button></div>; }

export function EmptyState({ message }: { readonly message: string }) { return <div className="glass rounded-2xl p-8 text-center text-sm text-white/45">{message}</div>; }
