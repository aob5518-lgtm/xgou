'use client';

import { useState } from 'react';
import { getChainConfig } from '@xgou/chains';
import { CircleAlert, LogIn, Wallet } from 'lucide-react';
import { formatUnits } from 'viem';
import { useConnect, useConnection, useConnectors, useDisconnect, useReadContract, useSwitchChain } from 'wagmi';
import { Button } from '@/components/ui/Button';
import { useSiweSession } from '@/hooks/useSiweSession';

const chain = getChainConfig(process.env.NEXT_PUBLIC_CHAIN_ENV);

export function WalletButton() {
  const { address, chainId, status } = useConnection();
  const connectors = useConnectors();
  const { mutateAsync: connectAsync, isPending: isConnecting } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const { mutateAsync: switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const session = useSiweSession();
  const [walletError, setWalletError] = useState<string | null>(null);
  const onCorrectChain = chainId === chain.id;
  const balance = useReadContract({
    abi: [{
      type: 'function',
      name: 'balanceOf',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: 'balance', type: 'uint256' }],
    }],
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    address: chain.usdc.address,
    chainId: chain.id,
    query: { enabled: Boolean(address && onCorrectChain) },
  });
  const formattedBalance = balance.data === undefined ? '—' : formatUnits(balance.data, chain.usdc.decimals);

  if (status !== 'connected') {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          className="h-9 min-h-9 px-3 text-[10px]"
          variant="outline"
          disabled={isConnecting}
          onClick={() => {
            const connector = connectors[0];
            if (!connector) {
              setWalletError('未检测到兼容钱包');
              return;
            }
            setWalletError(null);
            void connectAsync({ connector }).catch(() => { setWalletError('钱包连接失败，请确认已安装并解锁钱包'); });
          }}
        >
          <Wallet size={13} />{isConnecting ? 'CONNECTING…' : 'CONNECT WALLET'}
        </Button>
        {walletError && <span className="max-w-48 text-right text-[8px] text-[var(--red)]">{walletError}</span>}
      </div>
    );
  }

  if (!onCorrectChain) {
    return (
      <Button
        className="h-9 min-h-9 px-3 text-[10px]"
        variant="danger"
        disabled={isSwitching}
        onClick={() => { void switchChainAsync({ chainId: chain.id }).catch(() => { setWalletError(`无法切换到 ${chain.name}`); }); }}
      >
        <CircleAlert size={13} />{isSwitching ? 'SWITCHING…' : `切换到 ${chain.name}`}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="hidden text-right sm:block">
        <p className="text-[8px] tracking-[.12em] text-[var(--cyan)]">{chain.name}</p>
        <p className="text-[8px] text-white/45">USDC Gas {formattedBalance}</p>
        {balance.data === BigInt(0) && chain.faucetUrl && <a className="text-[8px] text-[var(--red)] underline" href={chain.faucetUrl} target="_blank" rel="noreferrer">Test USDC Gas 不足 · Get Test USDC</a>}
      </div>
      {!session.authenticated && (
        <Button
          className="h-9 min-h-9 px-3 text-[10px]"
          variant="primary"
          disabled={session.isAuthenticating}
          onClick={() => { void session.authenticate().catch(() => undefined); }}
        >
          <LogIn size={13} />{session.isAuthenticating ? 'SIGNING…' : 'SIWE LOGIN'}
        </Button>
      )}
      <Button
        className="h-9 min-h-9 px-3 text-[10px]"
        variant="outline"
        title={session.authenticated ? 'Wallet connected and SIWE authenticated' : 'Wallet connected; session not authenticated'}
        onClick={() => { session.logout(); disconnect(); }}
      >
        <Wallet size={13} />{address.slice(0, 6)}…{address.slice(-4)}
      </Button>
      {session.error && <span className="sr-only" role="alert">{session.error}</span>}
    </div>
  );
}
