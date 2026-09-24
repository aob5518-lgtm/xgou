'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getChainConfig } from '@xgou/chains';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { defineChain } from 'viem';
import { useState } from 'react';

const selectedChain = getChainConfig(process.env.NEXT_PUBLIC_CHAIN_ENV);
const arcChain = defineChain({
  id: selectedChain.id,
  name: selectedChain.name,
  nativeCurrency: selectedChain.nativeCurrency,
  rpcUrls: {
    default: {
      http: [...selectedChain.rpcUrls],
      webSocket: [...selectedChain.webSocketUrls],
    },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: selectedChain.blockExplorerUrls[0] ?? 'https://explorer.testnet.arc.io' },
  },
  testnet: selectedChain.isTestnet,
});

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const connectors = [
  injected(),
  ...(walletConnectProjectId
    ? [walletConnect({
        projectId: walletConnectProjectId,
        metadata: {
          name: 'XGOU',
          description: 'XGOU Arc Testnet participation',
          url: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
          icons: [],
        },
      })]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [arcChain],
  connectors,
  transports: { [arcChain.id]: http(selectedChain.rpcUrls[0]) },
  ssr: true,
});

export function Providers({ children }: { readonly children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return <WagmiProvider config={wagmiConfig}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></WagmiProvider>;
}
