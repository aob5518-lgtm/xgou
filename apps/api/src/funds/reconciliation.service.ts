import { Injectable } from '@nestjs/common';
import { getChainConfig } from '@xgou/chains';
import { Decimal } from 'decimal.js';
import { ArcChainAdapter } from '../chain/arc-chain.adapter.js';
import { DeploymentRegistryService } from '../chain/deployment-registry.service.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adapter: ArcChainAdapter,
    private readonly deployments: DeploymentRegistryService,
  ) {}

  async run(): Promise<readonly { fundDomain: 'BULL' | 'SPOT' | 'FUTURES'; difference: string; severity: string }[]> {
    const chain = getChainConfig(process.env.CHAIN_ENV);
    const deployment = this.deployments.get();
    const domains = [
      { fundDomain: 'BULL' as const, code: 'bull-vault:USDC', address: deployment.bullVault },
      { fundDomain: 'SPOT' as const, code: 'spot-treasury:USDC', address: deployment.spotVault },
      { fundDomain: 'FUTURES' as const, code: 'futures-treasury:USDC', address: deployment.futuresVault },
    ];
    const dust = new Decimal(process.env.RECONCILIATION_DUST_THRESHOLD ?? '0.000001');
    const results = [];
    for (const domain of domains) {
      const account = await this.prisma.db.ledgerAccount.findUnique({
        where: { code: domain.code },
        include: { entries: { select: { side: true, amount: true } } },
      });
      const internal = (account?.entries ?? []).reduce(
        (sum, entry) => entry.side === 'DEBIT' ? sum.plus(entry.amount.toString()) : sum.minus(entry.amount.toString()),
        new Decimal(0),
      );
      const externalRaw = await this.adapter.getTokenBalance(chain.usdc.address, domain.address);
      const external = new Decimal(externalRaw.toString()).div(new Decimal(10).pow(chain.usdc.decimals));
      const difference = external.minus(internal);
      const severity = difference.abs().gt(dust) ? 'CRITICAL' as const : 'INFO' as const;
      if (!difference.isZero()) {
        await this.prisma.db.reconciliationDifference.create({
          data: {
            chainId: String(chain.id),
            fundDomain: domain.fundDomain,
            internalBalance: internal.toFixed(),
            externalBalance: external.toFixed(),
            difference: difference.toFixed(),
            severity,
          },
        });
      }
      results.push({ fundDomain: domain.fundDomain, difference: difference.toFixed(), severity });
    }
    return results;
  }
}
