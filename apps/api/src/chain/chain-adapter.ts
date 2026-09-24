import type { Address, Hash, Log, TransactionReceipt } from 'viem';

export interface ChainAdapter {
  getBlockNumber(): Promise<bigint>;
  getTransaction(hash: Hash): Promise<unknown>;
  getTransactionReceipt(hash: Hash): Promise<TransactionReceipt>;
  getLogs(input: { readonly address: Address; readonly fromBlock: bigint; readonly toBlock: bigint }): Promise<readonly Log[]>;
  getBalance(address: Address): Promise<bigint>;
  getTokenBalance(token: Address, owner: Address): Promise<bigint>;
  waitForFinality(hash: Hash): Promise<TransactionReceipt>;
  healthCheck(): Promise<boolean>;
}
