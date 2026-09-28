'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getXgouDataProvider, type XgouDataProvider } from '@/services/xgou-data-provider';

type ResourceData<M extends keyof XgouDataProvider> = Awaited<ReturnType<XgouDataProvider[M]>>;

export function useXgouResource<M extends keyof XgouDataProvider>(method: M): { readonly data: ResourceData<M> | null; readonly error: Error | null; readonly loading: boolean; readonly refresh: () => void } {
  const provider = useMemo(() => getXgouDataProvider(), []);
  const [data, setData] = useState<ResourceData<M> | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => { setRevision((value) => value + 1); }, []);
  useEffect(() => {
    let active = true; setLoading(true); setError(null);
    void (provider[method]() as Promise<ResourceData<M>>).then((value) => { if (active) setData(value); }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause : new Error('Data unavailable')); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [method, provider, revision]);
  return { data, error, loading, refresh } as const;
}
