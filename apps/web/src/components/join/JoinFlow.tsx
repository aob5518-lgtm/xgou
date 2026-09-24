'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { calculateJoinAllocation, formatNumber } from '@/lib/finance';
import { getAppMode } from '@/lib/app-mode';
import { getChainConfig } from '@xgou/chains';
import { getArcTestnetDeploymentState } from '@xgou/contracts/deployments';
import { keccak256, parseUnits, stringToHex } from 'viem';
import { readContract, waitForTransactionReceipt } from '@wagmi/core';
import { useConnection, useWriteContract } from 'wagmi';
import { wagmiConfig } from '@/components/layout/Providers';
import { useSiweSession } from '@/hooks/useSiweSession';
import { getAccessToken } from '@/services/auth-session';

const steps = ['Amount', 'Inviter', 'Review', 'Confirm'] as const;
const allocationTone = ['var(--red)', 'var(--cyan)', 'var(--blue)'] as const;

function DemoJoinFlow() {
  const [step, setStep] = useState(0); const [amount, setAmount] = useState('10000'); const [inviter, setInviter] = useState(''); const [processing, setProcessing] = useState(false); const [complete, setComplete] = useState(false);
  const allocation = useMemo(() => { try { return calculateJoinAllocation(amount); } catch { return calculateJoinAllocation(0); } }, [amount]);
  const confirm = () => { setProcessing(true); window.setTimeout(() => { setProcessing(false); setComplete(true); }, 1400); };
  if (complete) return <div className="glass mx-auto max-w-xl rounded-2xl p-8 text-center"><span className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--success)]/10 text-[var(--success)]"><Check /></span><p className="eyebrow mt-8">DEMO CONFIRMATION</p><h2 className="mt-3 text-3xl font-light">XGOU AGENT STARTED</h2><p className="mt-4 text-sm text-white/45">没有调用合约，也没有移动任何资金。</p><Button asChild className="mt-8"><Link href="/dashboard">进入总览</Link></Button></div>;
  return <div className="mx-auto max-w-3xl"><div className="mb-7 grid grid-cols-4 gap-2">{steps.map((label, index) => <div key={label} className={index <= step ? 'text-white' : 'text-white/25'}><div className={`h-px ${index <= step ? 'bg-white/70' : 'bg-white/10'}`} /><p className="mt-2 text-[9px] tracking-[.12em]">STEP {String(index + 1).padStart(2, '0')}</p><p className="mt-1 text-[10px]">{label}</p></div>)}</div><div className="glass rounded-2xl p-6 md:p-9"><div className="flex items-center justify-between"><p className="eyebrow">STEP {String(step + 1).padStart(2, '0')} · {steps[step]}</p><span className="text-[9px] text-white/30">DEMO ONLY</span></div>
    {step === 0 && <div className="mt-9"><label className="text-xs text-white/45">参与金额</label><div className="mt-3 flex items-center rounded-xl bg-white/[.025] px-5 py-4 ring-1 ring-white/[.08] focus-within:ring-white/20"><input aria-label="Participation Amount" value={amount} onChange={(event) => { setAmount(event.target.value.replace(/[^0-9.]/g, '')); }} className="min-w-0 flex-1 bg-transparent text-4xl font-light outline-none md:text-6xl" /><span className="text-sm text-white/40">USDC</span></div><div className="mt-7 grid gap-3 sm:grid-cols-3">{[['BULL FUND','50%',allocation.bull],['SPOT AGENT','30%',allocation.spot],['FUTURES TREND','20%',allocation.futures]].map(([name, share, value], index) => <div key={String(name)} className="rounded-xl bg-white/[.02] p-4 ring-1 ring-white/[.06]" style={{ boxShadow: `inset 2px 0 ${allocationTone[index] ?? 'white'}` }}><div className="flex justify-between text-[9px] tracking-wider text-white/40"><span>{String(name)}</span><span style={{ color: allocationTone[index] }}>{String(share)}</span></div><p className="mt-4 text-xl">{formatNumber(String(value), 8)}</p></div>)}</div></div>}
    {step === 1 && <div className="mt-9"><label className="text-xs text-white/45">邀请人钱包 · Demo 可选</label><input aria-label="Inviter Wallet" value={inviter} onChange={(event) => { setInviter(event.target.value); }} placeholder="0x…" className="mt-3 h-14 w-full rounded-xl border border-white/[.08] bg-black/20 px-4 outline-none focus:border-[var(--cyan)]" /><div className="mt-5 rounded-xl bg-white/[.025] p-4 text-xs text-white/40">{inviter ? 'INVITER BOUND · DEMO VALIDATION' : '预览环境可不填写邀请人。'}</div></div>}
    {step === 2 && <div className="mt-8 rounded-xl border border-white/[.07] p-5"><div className="flex justify-between"><span className="eyebrow">TOTAL</span><strong>{formatNumber(allocation.total.toFixed())} USDC</strong></div>{[['BULL · 50%',allocation.bull],['SPOT · 30%',allocation.spot],['FUTURES · 20%',allocation.futures],['PRINCIPAL XP',allocation.principalXp]].map(([label, value]) => <div key={String(label)} className="mt-4 flex justify-between border-t border-white/[.05] pt-4 text-sm"><span className="text-white/40">{String(label)}</span><span>{formatNumber(String(value))}{String(label) === 'PRINCIPAL XP' ? ' XP' : ' USDC'}</span></div>)}</div>}
    {step === 3 && <div className="mt-9 rounded-xl bg-white/[.025] p-6 text-center"><p className="text-2xl font-light">确认 Demo 配置</p><p className="mt-3 text-sm leading-6 text-white/45">不会触发 Approve、Deposit、钱包签名或任何合约调用。</p><p className="mt-5 font-mono text-sm">{formatNumber(allocation.total.toFixed())} USDC · {formatNumber(allocation.principalXp.toFixed())} XP</p></div>}
    <div className="mt-9 flex justify-between"><Button variant="outline" disabled={step === 0 || processing} onClick={() => { setStep((current) => current - 1); }}><ChevronLeft size={14} />返回</Button>{step < 3 ? <Button disabled={allocation.total.lte(0)} onClick={() => { setStep((current) => current + 1); }}>继续<ChevronRight size={14} /></Button> : <Button disabled={processing} onClick={confirm}>{processing ? '处理中…' : 'CONFIRM DEMO'}</Button>}</div>
  </div></div>;
}

const erc20Abi = [
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: 'amount', type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: 'success', type: 'bool' }] },
] as const;

const routerAbi = [{
  type: 'function', name: 'deposit', stateMutability: 'nonpayable',
  inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'clientReference', type: 'bytes32' }],
  outputs: [{ name: 'depositId', type: 'bytes32' }],
}] as const;

const progressLabels = ['创建参与记录', '授权 USDC', '提交链上交易', '等待 Arc 最终确认', 'XGOU 分配资金', '生成 XP', '完成'] as const;

function TestnetJoinFlow() {
  const chain = getChainConfig(process.env.NEXT_PUBLIC_CHAIN_ENV);
  const deployment = getArcTestnetDeploymentState();
  const { address, chainId, status } = useConnection();
  const session = useSiweSession();
  const { mutateAsync: writeContractAsync } = useWriteContract();
  const [step, setStep] = useState(0);
  const [amount, setAmount] = useState('10000');
  const [inviter, setInviter] = useState('');
  const [progress, setProgress] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const allocation = useMemo(() => { try { return calculateJoinAllocation(amount); } catch { return calculateJoinAllocation(0); } }, [amount]);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1';

  const runDeposit = async () => {
    setError(null);
    try {
      if (!deployment.deployed || !deployment.depositRouter) throw new Error('Arc Testnet 合约尚未部署，参与入口暂时关闭');
      if (status !== 'connected') throw new Error('请先连接钱包');
      if (chainId !== chain.id) throw new Error(`请切换到 ${chain.name}`);
      if (!session.authenticated) throw new Error('钱包已连接，但 SIWE 会话尚未登录或已过期');
      const accessToken = getAccessToken();
      if (!accessToken) throw new Error('登录会话已过期，请重新 SIWE 登录');
      const parsedAmount = parseUnits(allocation.total.toFixed(), chain.usdc.decimals);
      if (parsedAmount < parseUnits('1', chain.usdc.decimals)) throw new Error('Testnet 最低参与金额为 1 USDC');
      if (inviter) {
        const bind = await fetch(`${apiUrl}/referrals/bind`, {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
          credentials: 'include', body: JSON.stringify({ inviterWalletAddress: inviter }),
        });
        if (!bind.ok && bind.status !== 409) throw new Error('邀请人绑定失败');
      }
      const clientReference = keccak256(stringToHex(crypto.randomUUID()));
      setProgress(0);
      const intentResponse = await fetch(`${apiUrl}/funds/deposits`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        credentials: 'include',
        body: JSON.stringify({
          amount: allocation.total.toFixed(), asset: chain.usdc.symbol, chainId: String(chain.id),
          tokenDecimals: chain.usdc.decimals, clientReference, idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!intentResponse.ok) throw new Error('创建参与记录失败，Testnet Deposit 可能已暂停');
      const intent = await intentResponse.json() as { readonly id: string; readonly routerAddress: `0x${string}`; };
      const allowance = await readContract(wagmiConfig, {
        address: chain.usdc.address, abi: erc20Abi, functionName: 'allowance', args: [address, intent.routerAddress], chainId: chain.id,
      });
      if (allowance < parsedAmount) {
        setProgress(1);
        const approveHash = await writeContractAsync({
          address: chain.usdc.address, abi: erc20Abi, functionName: 'approve', args: [intent.routerAddress, parsedAmount], chainId: chain.id,
        });
        const approval = await waitForTransactionReceipt(wagmiConfig, { hash: approveHash, chainId: chain.id });
        if (approval.status !== 'success') throw new Error('USDC 授权交易失败');
      }
      setProgress(2);
      const depositHash = await writeContractAsync({
        address: intent.routerAddress, abi: routerAbi, functionName: 'deposit',
        args: [chain.usdc.address, parsedAmount, clientReference], chainId: chain.id,
      });
      setTxHash(depositHash);
      await fetch(`${apiUrl}/funds/deposits/${intent.id}/tx-submitted`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        credentials: 'include', body: JSON.stringify({ txHash: depositHash }),
      });
      setProgress(3);
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash: depositHash, chainId: chain.id });
      if (receipt.status !== 'success') throw new Error('Deposit 交易已回滚');
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const depositsResponse = await fetch(`${apiUrl}/funds/deposits`, { headers: { authorization: `Bearer ${accessToken}` }, credentials: 'include' });
        if (depositsResponse.status === 401) throw new Error('后台会话已过期，请重新 SIWE 登录');
        const deposits = await depositsResponse.json() as readonly { readonly id: string; readonly status: string }[];
        const current = deposits.find((item) => item.id === intent.id);
        if (current?.status === 'CHAIN_CONFIRMED') setProgress(4);
        if (current?.status === 'ALLOCATING') setProgress(5);
        if (current?.status === 'COMPLETED') { setProgress(6); return; }
        if (current?.status === 'FAILED' || current?.status === 'REJECTED') throw new Error('链上事件与参与记录不一致，已进入风控复核');
        await new Promise((resolve) => { window.setTimeout(resolve, 2_000); });
      }
      throw new Error('交易已确认，Indexer 仍在处理；刷新页面可从参与历史恢复进度');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '参与失败';
      if (/reject|denied/i.test(message)) setError('你已在钱包中取消签名或交易');
      else if (/insufficient funds/i.test(message)) setError('USDC Gas 或钱包 USDC 余额不足');
      else setError(message);
    }
  };

  if (progress === 6) return <div className="glass mx-auto max-w-xl rounded-2xl p-8 text-center"><Check className="mx-auto text-[var(--success)]" /><p className="eyebrow mt-6">ARC TESTNET COMPLETE</p><h2 className="mt-3 text-3xl font-light">参与已完成</h2>{txHash && <a className="mt-4 block text-xs text-[var(--cyan)] underline" href={`${chain.blockExplorerUrls[0] ?? ''}/tx/${txHash}`} target="_blank" rel="noreferrer">在 Arc Explorer 查看交易</a>}<Button asChild className="mt-8"><Link href="/dashboard">进入总览</Link></Button></div>;

  return <div className="mx-auto max-w-3xl"><div className="mb-7 grid grid-cols-4 gap-2">{steps.map((label, index) => <div key={label} className={index <= step ? 'text-white' : 'text-white/25'}><div className={`h-px ${index <= step ? 'bg-white/70' : 'bg-white/10'}`} /><p className="mt-2 text-[9px]">STEP {String(index + 1).padStart(2, '0')}</p><p className="mt-1 text-[10px]">{label}</p></div>)}</div><div className="glass rounded-2xl p-6 md:p-9"><div className="flex justify-between"><p className="eyebrow">ARC TESTNET · STEP {String(step + 1).padStart(2, '0')}</p><span className="text-[9px] text-[var(--cyan)]">TEST USDC ONLY</span></div>
    {step === 0 && <div className="mt-9"><label className="text-xs text-white/45">参与金额</label><div className="mt-3 flex items-center rounded-xl bg-white/[.025] px-5 py-4 ring-1 ring-white/[.08]"><input aria-label="Participation Amount" value={amount} onChange={(event) => { setAmount(event.target.value.replace(/[^0-9.]/g, '')); }} className="min-w-0 flex-1 bg-transparent text-4xl outline-none md:text-6xl" /><span>USDC</span></div><div className="mt-7 grid gap-3 sm:grid-cols-3">{[['BULL FUND','50%',allocation.bull],['SPOT STRATEGY','30%',allocation.spot],['FUTURES TREND','20%',allocation.futures]].map(([name, share, value]) => <div key={String(name)} className="rounded-xl bg-white/[.02] p-4"><p className="text-[9px] text-white/40">{String(name)} · {String(share)}</p><p className="mt-3 text-xl">{formatNumber(String(value), 8)}</p></div>)}</div></div>}
    {step === 1 && <div className="mt-9"><label className="text-xs text-white/45">邀请人钱包 · 未绑定时可选</label><input aria-label="Inviter Wallet" value={inviter} onChange={(event) => { setInviter(event.target.value); }} placeholder="0x…" className="mt-3 h-14 w-full rounded-xl border border-white/[.08] bg-black/20 px-4 outline-none" /><p className="mt-4 text-xs text-white/35">绑定成功后不可修改；少于 100 USDC 仍可参与，但不改变邀请资格规则。</p></div>}
    {step === 2 && <div className="mt-8 rounded-xl border border-white/[.07] p-5">{[['TOTAL',allocation.total],['BULL · 50%',allocation.bull],['SPOT · 30%',allocation.spot],['FUTURES · 20%',allocation.futures],['PRINCIPAL XP',allocation.principalXp]].map(([label, value]) => <div key={String(label)} className="mt-3 flex justify-between border-b border-white/[.05] pb-3"><span className="text-white/40">{String(label)}</span><span>{formatNumber(String(value))}{String(label) === 'PRINCIPAL XP' ? ' XP' : ' USDC'}</span></div>)}</div>}
    {step === 3 && <div className="mt-8"><p className="text-sm text-white/50">钱包将分两步确认：先授权本次金额，再提交 Deposit。不会无限授权。</p>{progress >= 0 && <div className="mt-6 space-y-2">{progressLabels.map((label, index) => <p key={label} className={index <= progress ? 'text-[var(--success)]' : 'text-white/25'}>{index <= progress ? '●' : '○'} {label}</p>)}</div>}{error && <p role="alert" className="mt-5 rounded-xl bg-[var(--red)]/10 p-4 text-sm text-[var(--red)]">{error}</p>}</div>}
    <div className="mt-9 flex justify-between"><Button variant="outline" disabled={step === 0 || progress >= 0} onClick={() => { setStep((current) => current - 1); }}><ChevronLeft size={14} />返回</Button>{step < 3 ? <Button disabled={allocation.total.lte(0)} onClick={() => { setStep((current) => current + 1); }}>继续<ChevronRight size={14} /></Button> : <Button disabled={progress >= 0} onClick={() => { void runDeposit(); }}>参与 XGOU</Button>}</div>
  </div></div>;
}

export function JoinFlow() {
  return getAppMode() === 'demo' ? <DemoJoinFlow /> : <TestnetJoinFlow />;
}
