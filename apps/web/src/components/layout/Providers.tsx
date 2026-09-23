'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors/injected';
import { defineChain } from 'viem';
import { useState } from 'react';

const arcDemo = defineChain({
  id: 31337,
  name: 'Arc Demo Preview',
  nativeCurrency: { name: 'Demo USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
  testnet: true,
});

const config = createConfig({ chains: [arcDemo], connectors: [injected()], transports: { [arcDemo.id]: http() }, ssr: true });

export function Providers({ children }: { readonly children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return <WagmiProvider config={config}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></WagmiProvider>;
}
