import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { getChainConfig } from '@xgou/chains';
import { getAddress } from 'viem';
import {
  allocateDeposit,
  buildDepositJournals,
  Money,
  type DepositJournalAccounts,
  type JournalDraft,
  type LedgerAccountRef,
} from '@xgou/ledger';
import type { Prisma } from '@xgou/database';
import type { AuditContext } from '../common/audit-context.js';
import { SystemConfigService } from '../config/system-config.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { DeploymentRegistryService } from '../chain/deployment-registry.service.js';
import { DepositSafetyService } from './deposit-safety.service.js';

export interface CreateDepositInput {
  readonly amount: string;
  readonly asset: 'USDC' | 'USDT';
  readonly chainId: string;
  readonly tokenDecimals: number;
  readonly clientReference: string;
  readonly idempotencyKey: string;
}

export interface DepositView {
  readonly id: string;
  readonly amount: string;
  readonly asset: string;
  readonly chainId: string;
  readonly tokenDecimals: number;
  readonly status: string;
  readonly clientReference: string;
  readonly txHash: string | null;
  readonly routerAddress: string;
  readonly assetAddress: string;
  readonly createdAt: string;
}

@Injectable()
export class DepositService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configs: SystemConfigService,
    private readonly deployments: DeploymentRegistryService,
    private readonly safety: DepositSafetyService,
  ) {}

  async create(userId: string, input: CreateDepositInput, audit: AuditContext): Promise<DepositView> {
    await this.safety.assertDepositsEnabled();
    const chain = getChainConfig(process.env.CHAIN_ENV);
    if (input.chainId !== String(chain.id)) throw new ConflictException('deposit chain does not match CHAIN_ENV');
    if (input.asset !== chain.usdc.symbol || input.tokenDecimals !== chain.usdc.decimals) {
      throw new ConflictException('deposit token metadata does not match chain registry');
    }
    const deployment = this.deployments.get();
    const existing = await this.prisma.db.deposit.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      if (existing.userId !== userId) throw new ConflictException('idempotency key belongs to another user');
      if (
        !new Decimal(existing.amount.toString()).eq(input.amount) ||
        existing.asset !== input.asset ||
        existing.chainId !== input.chainId ||
        existing.tokenDecimals !== input.tokenDecimals ||
        existing.externalRef !== input.clientReference
      ) {
        throw new ConflictException('idempotency key was already used with a different deposit payload');
      }
      return this.view(existing, await this.prisma.db.depositChainReference.findUniqueOrThrow({ where: { depositId: existing.id } }));
    }
    const deposit = await this.prisma.db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('user not found');
      const walletAddress = getAddress(user.walletAddress).toLowerCase();
      await tx.chainAccount.upsert({
        where: { userId_chainId: { userId, chainId: input.chainId } },
        create: { userId, chainId: input.chainId, walletAddress },
        update: { walletAddress },
      });
      const created = await tx.deposit.create({
        data: {
          userId,
          amount: input.amount,
          asset: input.asset,
          chainId: input.chainId,
          tokenDecimals: input.tokenDecimals,
          externalRef: input.clientReference,
          idempotencyKey: input.idempotencyKey,
          status: 'AWAITING_APPROVAL',
          chainReference: {
            create: {
              chainId: input.chainId,
              clientReference: input.clientReference,
              walletAddress,
              routerAddress: deployment.depositRouter.toLowerCase(),
              assetAddress: deployment.usdc.toLowerCase(),
            },
          },
        },
        include: { chainReference: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'DEPOSIT.CREATE',
          target: `deposit:${created.id}`,
          after: { amount: input.amount, asset: input.asset, chainId: input.chainId, status: created.status },
          ipHash: audit.ipHash,
          requestId: audit.requestId,
        },
      });
      return created;
    });
    if (!deposit.chainReference) throw new Error('deposit chain reference was not created');
    return this.view(deposit, deposit.chainReference);
  }

  async list(userId: string): Promise<readonly DepositView[]> {
    const deposits = await this.prisma.db.deposit.findMany({
      where: { userId },
      include: { chainReference: true },
      orderBy: { createdAt: 'desc' },
    });
    return deposits.flatMap((deposit) => deposit.chainReference ? [this.view(deposit, deposit.chainReference)] : []);
  }

  async markTransactionSubmitted(userId: string, depositId: string, txHash: string, audit: AuditContext): Promise<DepositView> {
    const deposit = await this.prisma.db.deposit.findUnique({
      where: { id: depositId },
      include: { chainReference: true },
    });
    if (!deposit || !deposit.chainReference) throw new NotFoundException('deposit not found');
    if (deposit.userId !== userId) throw new ForbiddenException('deposit belongs to another user');
    if (!['AWAITING_APPROVAL', 'AWAITING_TX', 'TX_SUBMITTED'].includes(deposit.status)) {
      throw new ConflictException('deposit is not awaiting a transaction');
    }
    if (deposit.chainReference.txHash && deposit.chainReference.txHash.toLowerCase() !== txHash.toLowerCase()) {
      throw new ConflictException('deposit already has a different transaction hash');
    }
    const updated = await this.prisma.db.$transaction(async (tx) => {
      const saved = await tx.deposit.update({ where: { id: depositId }, data: { status: 'TX_SUBMITTED' } });
      const chainReference = await tx.depositChainReference.update({
        where: { depositId },
        data: { txHash: txHash.toLowerCase() },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'DEPOSIT.TX_SUBMITTED',
          target: `deposit:${depositId}`,
          before: { status: deposit.status },
          after: { status: 'TX_SUBMITTED', txHash: txHash.toLowerCase() },
          ipHash: audit.ipHash,
          requestId: audit.requestId,
        },
      });
      return { saved, chainReference };
    });
    return this.view(updated.saved, updated.chainReference);
  }

  async allocateConfirmed(depositId: string, allocationRequestId: string, audit: AuditContext): Promise<void> {
    const effectiveConfig = await this.configs.current();
    if (effectiveConfig.version <= 0) {
      throw new ConflictException('a persisted system config version is required before allocating funds');
    }
    await this.prisma.db.$transaction(async (tx) => {
      const deposit = await tx.deposit.findUnique({ where: { id: depositId } });
      if (!deposit) throw new NotFoundException('deposit not found');
      if (deposit.status === 'COMPLETED') return;
      if (deposit.status !== 'CHAIN_CONFIRMED') throw new ConflictException('only chain-confirmed deposits can be allocated');
      await tx.deposit.update({ where: { id: deposit.id }, data: { status: 'ALLOCATING' } });

      const money = new Money({
        amount: deposit.amount.toString(),
        asset: deposit.asset,
        chainId: deposit.chainId,
        decimals: deposit.tokenDecimals,
      });
      const allocation = allocateDeposit(money, effectiveConfig.values);
      const accounts = await this.resolveAccounts(tx, deposit.userId, deposit.asset);
      const [confirmationJournal, allocationJournal] = buildDepositJournals(money, allocation, accounts);
      await this.postJournal(
        tx,
        confirmationJournal,
        `${allocationRequestId}:confirmation`,
        deposit.id,
      );
      const allocationId = await this.postJournal(
        tx,
        allocationJournal,
        `${allocationRequestId}:allocation`,
        deposit.id,
      );
      const allocations = [
        { fundDomain: 'BULL' as const, money: allocation.BULL, ratio: effectiveConfig.values.bullAllocation },
        { fundDomain: 'SPOT' as const, money: allocation.SPOT, ratio: effectiveConfig.values.spotStrategyAllocation },
        {
          fundDomain: 'FUTURES' as const,
          money: allocation.FUTURES,
          ratio: effectiveConfig.values.futuresStrategyAllocation,
        },
      ];
      await tx.fundAllocation.createMany({
        data: allocations.map((item) => ({
          depositId: deposit.id,
          fundDomain: item.fundDomain,
          amount: item.money.amount.toFixed(),
          ratio: item.ratio,
          configVersion: effectiveConfig.version,
          status: 'POSTED',
          ledgerReference: allocationId,
          postedAt: new Date(),
        })),
      });

      const participation = await tx.participation.create({
        data: {
          userId: deposit.userId,
          amount: deposit.amount,
          asset: deposit.asset,
          status: 'EFFECTIVE',
          externalRef: `deposit:${deposit.id}`,
          effectiveAt: new Date(),
        },
      });
      const principalXp = new Decimal(deposit.amount.toString()).mul(effectiveConfig.values.xpPerDollar);
      await tx.principalXpEntry.create({
        data: {
          userId: deposit.userId,
          participationId: participation.id,
          amount: principalXp.toFixed(),
        },
      });
      await tx.deposit.update({
        where: { id: deposit.id },
        data: { status: 'COMPLETED', allocatedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: null,
          action: 'DEPOSIT.ALLOCATE_50_30_20',
          target: `deposit:${deposit.id}`,
          before: { status: deposit.status },
          after: {
            status: 'COMPLETED',
            bull: allocation.BULL.amount.toFixed(),
            spot: allocation.SPOT.amount.toFixed(),
            futures: allocation.FUTURES.amount.toFixed(),
            configVersion: effectiveConfig.version,
          },
          ipHash: audit.ipHash,
          requestId: audit.requestId,
        },
      });
    }, { isolationLevel: 'Serializable' });
  }

  private async resolveAccounts(
    tx: Prisma.TransactionClient,
    userId: string,
    asset: string,
  ): Promise<DepositJournalAccounts> {
    const userPrincipal = await tx.ledgerAccount.upsert({
      where: { code: `user-principal:${userId}:${asset}` },
      create: { code: `user-principal:${userId}:${asset}`, type: 'USER_PRINCIPAL', ownerUserId: userId, asset },
      update: {},
    });
    const requiredCodes = [
      `deposit-clearing:${asset}`,
      `bull-vault:${asset}`,
      `spot-treasury:${asset}`,
      `futures-treasury:${asset}`,
    ];
    const systemAccounts = await tx.ledgerAccount.findMany({ where: { code: { in: requiredCodes }, status: 'ACTIVE' } });
    if (systemAccounts.length !== requiredCodes.length) {
      throw new ConflictException(`system ledger accounts are not provisioned for ${asset}`);
    }
    const byCode = new Map(systemAccounts.map((account) => [account.code, account]));
    const ref = (code: string): LedgerAccountRef => {
      const account = byCode.get(code);
      if (!account) throw new ConflictException(`missing ledger account ${code}`);
      return {
        id: account.id,
        type: account.type,
        asset: account.asset,
        ...(account.fundDomain === null ? {} : { fundDomain: account.fundDomain as 'BULL' | 'SPOT' | 'FUTURES' }),
      };
    };
    return {
      depositClearing: ref(`deposit-clearing:${asset}`),
      userPrincipal: { id: userPrincipal.id, type: userPrincipal.type, asset: userPrincipal.asset },
      bullVault: ref(`bull-vault:${asset}`),
      spotTreasury: ref(`spot-treasury:${asset}`),
      futuresTreasury: ref(`futures-treasury:${asset}`),
    };
  }

  private async postJournal(
    tx: Prisma.TransactionClient,
    journal: JournalDraft,
    idempotencyKey: string,
    depositId: string,
  ): Promise<string> {
    const existing = await tx.ledgerTransaction.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.referenceType !== 'DEPOSIT' || existing.referenceId !== depositId) {
        throw new ConflictException('ledger idempotency key collision');
      }
      return existing.id;
    }
    const created = await tx.ledgerTransaction.create({
      data: {
        kind: journal.kind,
        idempotencyKey,
        referenceType: 'DEPOSIT',
        referenceId: depositId,
        description: `${journal.kind} for deposit ${depositId}`,
        effectiveAt: new Date(),
        entries: {
          create: journal.entries.map((entry) => ({
            accountId: entry.accountId,
            side: entry.side,
            amount: entry.money.amount.toFixed(),
            asset: entry.money.asset,
            fundDomain: entry.fundDomain ?? null,
          })),
        },
      },
    });
    return created.id;
  }

  private view(deposit: {
    id: string;
    amount: { toString(): string };
    asset: string;
    chainId: string;
    tokenDecimals: number;
    status: string;
    createdAt: Date;
  }, chainReference: {
    clientReference: string;
    txHash: string | null;
    routerAddress: string;
    assetAddress: string;
  }): DepositView {
    return {
      id: deposit.id,
      amount: deposit.amount.toString(),
      asset: deposit.asset,
      chainId: deposit.chainId,
      tokenDecimals: deposit.tokenDecimals,
      status: deposit.status,
      clientReference: chainReference.clientReference,
      txHash: chainReference.txHash,
      routerAddress: chainReference.routerAddress,
      assetAddress: chainReference.assetAddress,
      createdAt: deposit.createdAt.toISOString(),
    };
  }
}
