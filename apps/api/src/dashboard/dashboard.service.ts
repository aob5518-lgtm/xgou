import { Injectable } from '@nestjs/common';
import { getChainConfig } from '@xgou/chains';
import { Decimal } from 'decimal.js';
import { DeploymentRegistryService } from '../chain/deployment-registry.service.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deployments: DeploymentRegistryService,
  ) {}

  async get(userId: string) {
    const chain = getChainConfig(process.env.CHAIN_ENV);
    const [user, allocations, principalAggregate, latestSnapshot, latestDeposit] = await Promise.all([
      this.prisma.db.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.db.fundAllocation.groupBy({
        by: ['fundDomain'],
        where: { deposit: { userId, status: 'COMPLETED' }, status: 'POSTED' },
        _sum: { amount: true },
      }),
      this.prisma.db.principalXpEntry.aggregate({ where: { userId }, _sum: { amount: true } }),
      this.prisma.db.xpSnapshot.findFirst({ where: { userId }, orderBy: { snapshotAt: 'desc' } }),
      this.prisma.db.deposit.findFirst({
        where: { userId },
        include: { chainReference: true, allocations: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const amounts = new Map(allocations.map((item) => [item.fundDomain, new Decimal(item._sum.amount?.toString() ?? 0)]));
    const bull = amounts.get('BULL') ?? new Decimal(0);
    const spot = amounts.get('SPOT') ?? new Decimal(0);
    const futures = amounts.get('FUTURES') ?? new Decimal(0);
    const totalAssets = bull.plus(spot).plus(futures);
    const principal = new Decimal(principalAggregate._sum.amount?.toString() ?? 0);
    const dynamic = new Decimal(latestSnapshot?.dynamicXp.toString() ?? 0);
    const deployment = this.deployments.state();
    return {
      totalAssets: totalAssets.toFixed(),
      totalReturn: '0',
      // No market index is computed from the ledger yet; expose a neutral
      // value rather than null so the shared dashboard renderer remains safe.
      xgouIndex: 0,
      marketStage: 'PAPER STRATEGY PHASE',
      funds: [
        { name: 'BULL FUND', allocation: 50, nav: bull.toFixed(), returnPercent: 0, tone: 'red' },
        { name: 'SPOT STRATEGY', allocation: 30, nav: spot.toFixed(), returnPercent: 0, tone: 'cyan' },
        { name: 'FUTURES TREND', allocation: 20, nav: futures.toFixed(), returnPercent: 0, tone: 'blue' },
      ],
      navHistory: [{ label: 'CURRENT', value: totalAssets.toFixed() }],
      xp: { principal: principal.toFixed(), dynamic: dynamic.toFixed(), total: principal.plus(dynamic).toFixed() },
      rewards: { available: '0', pending: '0', totalEarned: '0', totalWithdrawn: '0' },
      wallet: user.walletAddress,
      network: { id: chain.id, name: chain.name, isTestnet: chain.isTestnet },
      contracts: { deployed: deployment.deployed, depositRouter: deployment.depositRouter },
      depositStatus: latestDeposit ? {
        id: latestDeposit.id,
        amount: latestDeposit.amount.toString(),
        status: latestDeposit.status,
        txHash: latestDeposit.chainReference?.txHash ?? null,
        createdAt: latestDeposit.createdAt.toISOString(),
        allocations: latestDeposit.allocations.map((allocation) => ({
          fundDomain: allocation.fundDomain,
          amount: allocation.amount.toString(),
        })),
      } : null,
      dataMode: 'TESTNET_REAL_LEDGER',
      agentStatus: 'NOT_ACTIVE_YET',
    };
  }
}
