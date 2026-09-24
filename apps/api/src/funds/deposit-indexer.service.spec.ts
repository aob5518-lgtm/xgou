import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Address, Hex, Log } from 'viem';
import { DepositIndexer } from './deposit-indexer.service.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { ArcChainAdapter } from '../chain/arc-chain.adapter.js';
import type { DeploymentRegistryService } from '../chain/deployment-registry.service.js';
import type { DepositService } from './deposit.service.js';
import type { SystemConfigService } from '../config/system-config.service.js';

describe('DepositIndexer replay protection', () => {
  beforeEach(() => { process.env.CHAIN_ENV = 'arc-testnet'; });

  it('does not allocate ledger, participation, or XP again for an existing chain event', async () => {
    const blockHash: Hex = `0x${'11'.repeat(32)}`;
    const routerAddress: Address = `0x${'22'.repeat(20)}`;
    const transactionHash: Hex = `0x${'33'.repeat(32)}`;
    const findUnique = vi.fn().mockResolvedValue({ id: 'event-1', blockHash });
    const eventCreate = vi.fn();
    const allocateConfirmed = vi.fn();
    const prisma = { db: { onchainEvent: { findUnique, create: eventCreate, update: vi.fn() } } } as unknown as PrismaService;
    const indexer = new DepositIndexer(
      prisma,
      {} as ArcChainAdapter,
      {} as DeploymentRegistryService,
      { allocateConfirmed } as unknown as DepositService,
      {} as SystemConfigService,
    );
    const log = {
      address: routerAddress,
      blockHash,
      blockNumber: BigInt(123),
      data: '0x' as Hex,
      logIndex: 4,
      removed: false,
      topics: [],
      transactionHash,
      transactionIndex: 0,
    } satisfies Log;

    await expect(indexer.processLog(log)).resolves.toBe(0);
    expect(eventCreate).not.toHaveBeenCalled();
    expect(allocateConfirmed).not.toHaveBeenCalled();
  });
});
