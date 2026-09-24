import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { getChainConfig } from '@xgou/chains';
import { ArcChainAdapter } from '../chain/arc-chain.adapter.js';
import { DeploymentRegistryService } from '../chain/deployment-registry.service.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class DepositSafetyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adapter: ArcChainAdapter,
    private readonly deployments: DeploymentRegistryService,
  ) {}

  async assertDepositsEnabled(): Promise<void> {
    if (process.env.DEPOSITS_ENABLED === 'false') throw new ServiceUnavailableException('deposits are disabled');
    const chain = getChainConfig(process.env.CHAIN_ENV);
    const deployment = this.deployments.get();
    if (deployment.chainId !== chain.id) throw new ServiceUnavailableException('chain and deployment mismatch');
    if (!(await this.adapter.healthCheck())) throw new ServiceUnavailableException('Arc RPC is unhealthy');
    const critical = await this.prisma.db.reconciliationDifference.findFirst({
      where: { chainId: String(chain.id), status: 'OPEN', severity: 'CRITICAL' },
    });
    if (critical) throw new ServiceUnavailableException('deposits paused due to reconciliation difference');
  }
}
