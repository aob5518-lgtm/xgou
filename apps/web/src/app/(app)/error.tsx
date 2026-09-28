'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/ui/DataState';

export default function ProductError({ error, reset }: { readonly error: Error & { digest?: string }; readonly reset: () => void }) {
  useEffect(() => { console.error('XGOU route error', { message: error.message, digest: error.digest }); }, [error]);
  return <ErrorState error={error} retry={reset}/>;
}
