import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { getChainConfig } from '@xgou/chains';
import { Decimal } from 'decimal.js';
import { decodeEventLog, formatUnits, type Address, type Hash, type Hex, type Log } from 'viem';
import { ArcChainAdapter } from '../chain/arc-chain.adapter.js';
import { depositAllocatedEvent } from '../chain/chain.constants.js';
import { DeploymentRegistryService } from '../chain/deployment-registry.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { DepositService } from './deposit.service.js';
import { SystemConfigService } from '../config/system-config.service.js';
import type { SystemConfig } from '@xgou/shared';
import { expectedMinimumUnitAllocation, findAllocationMismatch } from './allocation-validation.js';
import { sha256 } from '../common/hash.js';

interface DepositAllocatedArgs {
  readonly depositId: Hex;
  readonly user: Address;
  readonly asset: Address;
  readonly amount: bigint;
  readonly bullAmount: bigint;
  readonly spotAmount: bigint;
  readonly futuresAmount: bigint;
  readonly clientReference: Hex;
  readonly timestamp: bigint;
}

@Injectable()
export class DepositIndexer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DepositIndexer.name);
  private readonly chain = getChainConfig(process.env.CHAIN_ENV);
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapter: ArcChainAdapter,
    private readonly deployments: DeploymentRegistryService,
    private readonly deposits: DepositService,
    private readonly configs: SystemConfigService,
  ) {}

  onModuleInit(): void {
    if (process.env.CHAIN_INDEXER_ENABLED !== 'true') return;
    this.timer = setInterval(() => { void this.scanOnce().catch((error: unknown) => { this.logger.error(error); }); }, 5_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async scanOnce(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const deployment = this.deployments.get();
      const key = {
        chainId: String(this.chain.id),
        contractAddress: deployment.depositRouter.toLowerCase(),
        eventName: 'DepositAllocated',
      };
      const cursor = await this.prisma.db.chainCursor.findUnique({
        where: { chainId_contractAddress_eventName: key },
      });
      const latest = await this.adapter.getBlockNumber();
      const fromBlock = cursor ? cursor.lastProcessedBlock + BigInt(1) : BigInt(deployment.deploymentBlock);
      if (fromBlock > latest) return 0;
      let processed = 0;
      for (let start = fromBlock; start <= latest; start += BigInt(1_000)) {
        const end = start + BigInt(999) > latest ? latest : start + BigInt(999);
        const logs = await this.adapter.getLogs({
          address: deployment.depositRouter,
          fromBlock: start,
          toBlock: end,
        });
        for (const log of logs) processed += await this.processLog(log);
        await this.prisma.db.chainCursor.upsert({
          where: { chainId_contractAddress_eventName: key },
          create: { ...key, lastProcessedBlock: end },
          update: { lastProcessedBlock: end },
        });
      }
      return processed;
    } finally {
      this.running = false;
    }
  }

  async processLog(log: Log): Promise<number> {
    if (!log.transactionHash || !log.blockHash || log.blockNumber === null || log.logIndex === null) return 0;
    const transactionHash = log.transactionHash;
    const logIndex = log.logIndex;
    const existing = await this.prisma.db.onchainEvent.findUnique({
      where: { chainId_txHash_logIndex: { chainId: String(this.chain.id), txHash: transactionHash, logIndex } },
    });
    if (existing) {
      if (existing.blockHash !== log.blockHash) {
        await this.prisma.db.onchainEvent.update({
          where: { id: existing.id },
          data: { status: 'REVIEW', error: 'block hash mismatch for finalized Arc event' },
        });
        return 0;
      }
      if (existing.status !== 'FINALIZED') return 0;
    }

    let args: DepositAllocatedArgs;
    try {
      const decoded = decodeEventLog({ abi: [depositAllocatedEvent], data: log.data, topics: log.topics, strict: true });
      args = decoded.args;
    } catch {
      return 0;
    }
    const payload = {
      depositId: args.depositId,
      user: args.user.toLowerCase(),
      asset: args.asset.toLowerCase(),
      amount: args.amount.toString(),
      bullAmount: args.bullAmount.toString(),
      spotAmount: args.spotAmount.toString(),
      futuresAmount: args.futuresAmount.toString(),
      clientReference: args.clientReference.toLowerCase(),
      timestamp: args.timestamp.toString(),
    };
    const reference = await this.prisma.db.depositChainReference.findFirst({
      where: {
        chainId: String(this.chain.id),
        clientReference: args.clientReference.toLowerCase(),
        walletAddress: args.user.toLowerCase(),
      },
      include: { deposit: true },
    });
    const event = existing ?? await this.prisma.db.onchainEvent.create({
      data: {
        chainId: String(this.chain.id),
        contractAddress: log.address.toLowerCase(),
        txHash: transactionHash,
        logIndex,
        blockNumber: log.blockNumber,
        blockHash: log.blockHash,
        eventName: 'DepositAllocated',
        payload,
        finalizedAt: new Date(),
      },
    });

    let effectiveConfig: SystemConfig | null = null;
    let configError: string | null = null;
    if (reference) {
      if (reference.deposit.configVersion === null) {
        configError = 'deposit has no system config version';
      } else {
        try {
          effectiveConfig = (await this.configs.byVersion(reference.deposit.configVersion)).values;
        } catch (error: unknown) {
          configError = error instanceof Error ? error.message : 'system config lookup failed';
        }
      }
    }
    const mismatch = configError ?? this.findMismatch(reference, args, log.address, transactionHash, effectiveConfig);
    if (!reference || mismatch) {
      const mismatchReason = mismatch ?? 'deposit intent not found';
      await this.prisma.db.$transaction(async (tx) => {
        await tx.onchainEvent.update({
          where: { id: event.id },
          data: { status: 'REVIEW', processedAt: new Date(), error: mismatchReason },
        });
        if (reference) {
          await tx.deposit.update({ where: { id: reference.depositId }, data: { status: 'FAILED' } });
          await tx.riskFlag.create({
            data: {
              userId: reference.deposit.userId,
              reason: 'ONCHAIN_DEPOSIT_MISMATCH',
              evidence: { ...payload, error: mismatchReason },
              score: '100',
            },
          });
          if (effectiveConfig && mismatchReason.includes('allocation mismatch')) {
            const expected = expectedMinimumUnitAllocation(args.amount, effectiveConfig);
            const scale = new Decimal(10).pow(this.chain.usdc.decimals);
            const rows = [
              { fundDomain: 'BULL' as const, expected: expected.bull, actual: args.bullAmount },
              { fundDomain: 'SPOT' as const, expected: expected.spot, actual: args.spotAmount },
              { fundDomain: 'FUTURES' as const, expected: expected.futures, actual: args.futuresAmount },
            ];
            await tx.reconciliationDifference.createMany({
              data: rows.map((row) => ({
                chainId: String(this.chain.id),
                fundDomain: row.fundDomain,
                internalBalance: new Decimal(row.expected.toString()).div(scale).toFixed(),
                externalBalance: new Decimal(row.actual.toString()).div(scale).toFixed(),
                difference: new Decimal(row.actual.toString()).minus(row.expected.toString()).div(scale).toFixed(),
                severity: 'CRITICAL',
              })),
            });
          }
        }
      });
      return 0;
    }

    await this.prisma.db.$transaction(async (tx) => {
      await tx.deposit.update({
        where: { id: reference.depositId },
        data: { status: 'CHAIN_CONFIRMED', confirmedAt: new Date() },
      });
      await tx.depositChainReference.update({
        where: { id: reference.id },
        data: { txHash: transactionHash, logIndex, blockNumber: log.blockNumber, blockHash: log.blockHash },
      });
    });
    await this.deposits.allocateConfirmed(
      reference.depositId,
      `arc:${String(this.chain.id)}:${transactionHash}:${String(logIndex)}`,
      { requestId: sha256(`indexer:${transactionHash}:${String(logIndex)}`), ipHash: 'system' },
    );
    await this.prisma.db.onchainEvent.update({
      where: { id: event.id },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });
    return 1;
  }

  private findMismatch(
    reference: {
      readonly routerAddress: string;
      readonly assetAddress: string;
      readonly txHash: string | null;
      readonly deposit: { readonly amount: { toString(): string }; readonly configVersion: number | null };
    } | null,
    args: DepositAllocatedArgs,
    routerAddress: Address,
    transactionHash: Hash,
    config: SystemConfig | null,
  ): string | null {
    if (!reference) return 'deposit intent not found';
    if (reference.routerAddress.toLowerCase() !== routerAddress.toLowerCase()) return 'wrong router';
    if (reference.assetAddress.toLowerCase() !== args.asset.toLowerCase()) return 'wrong token';
    if (reference.txHash && reference.txHash.toLowerCase() !== transactionHash.toLowerCase()) return 'wrong transaction hash';
    const eventAmount = new Decimal(formatUnits(args.amount, this.chain.usdc.decimals));
    if (!eventAmount.eq(reference.deposit.amount.toString())) return 'wrong amount';
    if (args.bullAmount + args.spotAmount + args.futuresAmount !== args.amount) return 'onchain allocation is not conserved';
    if (!config) return 'deposit system config is unavailable';
    const allocationMismatch = findAllocationMismatch(
      args.amount,
      { bull: args.bullAmount, spot: args.spotAmount, futures: args.futuresAmount },
      config,
    );
    if (allocationMismatch) return allocationMismatch;
    return null;
  }
}
