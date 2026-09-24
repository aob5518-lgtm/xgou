import { Injectable } from '@nestjs/common';
import { getChainConfig } from '@xgou/chains';
import { createPublicClient, defineChain, http, type Address, type Hash, type Log, type TransactionReceipt } from 'viem';
import { erc20BalanceAbi } from './chain.constants.js';
import type { ChainAdapter } from './chain-adapter.js';

@Injectable()
export class ArcChainAdapter implements ChainAdapter {
  private readonly config = getChainConfig(process.env.CHAIN_ENV);
  private readonly client = createPublicClient({
    chain: defineChain({
      id: this.config.id,
      name: this.config.name,
      nativeCurrency: this.config.nativeCurrency,
      rpcUrls: { default: { http: [...this.config.rpcUrls] } },
      blockExplorers: {
        default: { name: 'Arc Explorer', url: this.config.blockExplorerUrls[0] ?? 'https://explorer.testnet.arc.io' },
      },
      testnet: this.config.isTestnet,
    }),
    transport: http(process.env.ARC_TESTNET_RPC_URL ?? this.config.rpcUrls[0]),
  });

  getBlockNumber(): Promise<bigint> { return this.client.getBlockNumber(); }
  getTransaction(hash: Hash): Promise<unknown> { return this.client.getTransaction({ hash }); }
  getTransactionReceipt(hash: Hash): Promise<TransactionReceipt> { return this.client.getTransactionReceipt({ hash }); }
  getLogs(input: { readonly address: Address; readonly fromBlock: bigint; readonly toBlock: bigint }): Promise<readonly Log[]> {
    return this.client.getLogs(input);
  }
  getBalance(address: Address): Promise<bigint> { return this.client.getBalance({ address }); }
  getTokenBalance(token: Address, owner: Address): Promise<bigint> {
    return this.client.readContract({ address: token, abi: erc20BalanceAbi, functionName: 'balanceOf', args: [owner] });
  }

  async waitForFinality(hash: Hash): Promise<TransactionReceipt> {
    // Arc provides deterministic finality; waiting for the transaction receipt
    // is sufficient and avoids applying Ethereum confirmation heuristics.
    const receipt = await this.client.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`Arc transaction reverted: ${hash}`);
    return receipt;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const chainId = await this.client.getChainId();
      return chainId === this.config.id;
    } catch {
      return false;
    }
  }
}
