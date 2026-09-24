import { parseAbiItem } from 'viem';

export const depositAllocatedEvent = parseAbiItem(
  'event DepositAllocated(bytes32 indexed depositId, address indexed user, address indexed asset, uint256 amount, uint256 bullAmount, uint256 spotAmount, uint256 futuresAmount, bytes32 clientReference, uint256 timestamp)',
);

export const erc20BalanceAbi = [{
  type: 'function',
  name: 'balanceOf',
  stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: 'balance', type: 'uint256' }],
}] as const;
