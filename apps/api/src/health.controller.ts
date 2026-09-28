import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './database/prisma.service.js';
import { ArcChainAdapter } from './chain/arc-chain.adapter.js';
import { DeploymentRegistryService } from './chain/deployment-registry.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly arc: ArcChainAdapter, private readonly deployments: DeploymentRegistryService) {}

  @Get()
  async health(): Promise<{ status: 'ok'; database: 'up' }> {
    await this.prisma.db.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'up' };
  }

  @Get('product')
  async product() {
    await this.prisma.db.$queryRaw`SELECT 1`;
    const deployment = this.deployments.state();
    const [rpc, cursor, ledgerAccounts, xpEntries, spot, futures, reward] = await Promise.all([
      this.arc.healthCheck(),
      this.prisma.db.chainCursor.findFirst({ orderBy: { updatedAt: 'desc' } }),
      this.prisma.db.ledgerAccount.count({ where: { status: 'ACTIVE' } }),
      this.prisma.db.principalXpEntry.count(),
      this.prisma.db.strategy.findUnique({ where: { code: 'SPOT_SWING_V1' }, select: { status: true } }),
      this.prisma.db.strategy.findUnique({ where: { code: 'FUTURES_TREND_V1' }, select: { status: true } }),
      this.prisma.db.rewardEpoch.findFirst({ where: { mode: 'PAPER' }, orderBy: { number: 'desc' }, select: { status: true, number: true } }),
    ]);
    return {
      status: rpc && deployment.deployed ? 'ok' : 'degraded',
      api: 'up', database: 'up', arcRpc: rpc ? 'up' : 'down',
      indexer: cursor ? { status: 'ready', lastProcessedBlock: cursor.lastProcessedBlock.toString(), updatedAt: cursor.updatedAt.toISOString() } : { status: 'waiting' },
      depositRouter: deployment.deployed ? { status: 'deployed', address: deployment.depositRouter } : { status: 'not_deployed', address: null },
      ledger: { status: ledgerAccounts > 0 ? 'ready' : 'waiting', activeAccounts: ledgerAccounts },
      xp: { status: 'ready', entries: xpEntries },
      spotPaper: spot?.status ?? 'NO_PAPER_CYCLE_DATA', futuresPaper: futures?.status ?? 'NO_PAPER_CYCLE_DATA',
      rewardEngine: reward ? { status: reward.status, epoch: reward.number } : { status: 'NO_EPOCH' },
      productionReadiness: 'FAIL',
    };
  }
}
