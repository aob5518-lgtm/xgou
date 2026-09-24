'use client';

import { Wallet } from 'lucide-react';
import { useConnect, useConnection, useConnectors, useDisconnect } from 'wagmi';
import { Button } from '@/components/ui/Button';

export function WalletButton() {
  const { address, status } = useConnection();
  const connectors = useConnectors();
  const { mutate: connect } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  if (status === 'connected') return <Button className="h-9 px-3 text-[10px]" variant="outline" onClick={() => { disconnect(); }}><Wallet size={13} />{address.slice(0, 6)}…{address.slice(-4)}</Button>;
  return <Button className="h-9 px-3 text-[10px]" variant="outline" onClick={() => { const connector = connectors[0]; if (connector) connect({ connector }); }}><Wallet size={13} />CONNECT</Button>;
}
