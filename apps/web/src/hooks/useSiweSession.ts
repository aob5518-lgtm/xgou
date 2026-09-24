'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getChainConfig } from '@xgou/chains';
import { createSiweMessage } from 'viem/siwe';
import { useConnection, useSignMessage } from 'wagmi';
import { clearSession, readSession, writeSession } from '@/services/auth-session';

const chain = getChainConfig(process.env.NEXT_PUBLIC_CHAIN_ENV);
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1';

interface NonceResponse { readonly nonce: string; }
interface VerifyResponse { readonly accessToken: string; }

export function useSiweSession() {
  const { address, chainId, status } = useConnection();
  const { mutateAsync: signMessageAsync } = useSignMessage();
  const [sessionWallet, setSessionWallet] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = readSession();
    setSessionWallet(stored?.walletAddress ?? null);
  }, []);

  useEffect(() => {
    if (status !== 'connected' || chainId !== chain.id) {
      clearSession();
      setSessionWallet(null);
      return;
    }
    if (sessionWallet && sessionWallet !== address.toLowerCase()) {
      clearSession();
      setSessionWallet(null);
    }
  }, [address, chainId, sessionWallet, status]);

  const authenticate = useCallback(async () => {
    if (!address || chainId !== chain.id) throw new Error(`请先连接 ${chain.name}`);
    setIsAuthenticating(true);
    setError(null);
    try {
      const nonceResponse = await fetch(`${apiUrl}/auth/nonce`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      });
      if (!nonceResponse.ok) throw new Error('无法获取登录 nonce');
      const { nonce } = await nonceResponse.json() as NonceResponse;
      const uri = window.location.origin;
      const message = createSiweMessage({
        address,
        chainId: chain.id,
        domain: window.location.host,
        uri,
        version: '1',
        nonce,
        statement: 'Sign in to XGOU Arc Testnet. This does not submit a transaction.',
      });
      const signature = await signMessageAsync({ message });
      const verifyResponse = await fetch(`${apiUrl}/auth/verify`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      });
      if (!verifyResponse.ok) throw new Error('SIWE 登录验证失败');
      const { accessToken } = await verifyResponse.json() as VerifyResponse;
      writeSession({ accessToken, walletAddress: address });
      setSessionWallet(address.toLowerCase());
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'SIWE 登录失败';
      setError(message);
      throw cause;
    } finally {
      setIsAuthenticating(false);
    }
  }, [address, chainId, signMessageAsync]);

  const logout = useCallback(() => {
    clearSession();
    setSessionWallet(null);
  }, []);

  return useMemo(() => ({
    authenticated: Boolean(address && sessionWallet === address.toLowerCase()),
    authenticate,
    error,
    isAuthenticating,
    logout,
  }), [address, authenticate, error, isAuthenticating, logout, sessionWallet]);
}
