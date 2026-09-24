import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { getChainConfig } from '@xgou/chains';
import { Decimal } from 'decimal.js';
import { ArcChainAdapter } from '../chain/arc-chain.adapter.js';
import { DeploymentRegistryService } from '../chain/deployment-registry.service.js';
import { PrismaService } from '../database/prisma.service.js';

interface ReconciliationResult {
  readonly fundDomain: 'BULL' | 'SPOT' | 'FUTURES';
  readonly internal: string;
  readonly external: string;
  readonly difference: string;
  readonly severity: 'INFO' | 'CRITICAL';
}

@Injectable()
export class ReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReconciliationService.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapter: ArcChainAdapter,
    private readonly deployments: DeploymentRegistryService,
  ) {}

  onModuleInit(): void {
    if (process.env.RECONCILIATION_ENABLED !== 'true') return;
    const interval = Number(process.env.RECONCILIATION_INTERVAL_MS ?? 120_000);
    if (!Number.isSafeInteger(interval) || interval < 10_000) throw new Error('RECONCILIATION_INTERVAL_MS must be at least 10000');
    void this.run().catch((error: unknown) => { this.logger.error(error); });
    this.timer = setInterval(() => {
      void this.run().catch((error: unknown) => { this.logger.error(error); });
    }, interval);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<readonly ReconciliationResult[]> {
    if (this.running) return [];
    this.running = true;
    const chain = getChainConfig(process.env.CHAIN_ENV);
    const run = await this.prisma.db.reconciliationRun.create({ data: { chainId: String(chain.id) } });
    try {
      const deployment = this.deployments.get();
      const domains = [
        { fundDomain: 'BULL' as const, code: 'bull-vault:USDC', address: deployment.bullVault },
        { fundDomain: 'SPOT' as const, code: 'spot-treasury:USDC', address: deployment.spotVault },
        { fundDomain: 'FUTURES' as const, code: 'futures-treasury:USDC', address: deployment.futuresVault },
      ];
      const dust = new Decimal(process.env.RECONCILIATION_DUST_THRESHOLD ?? '0.000001');
      const results: ReconciliationResult[] = [];
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
        if (severity !== 'CRITICAL') {
          await this.prisma.db.reconciliationDifference.updateMany({
            where: {
              chainId: String(chain.id),
              fundDomain: domain.fundDomain,
              severity: 'CRITICAL',
              status: 'OPEN',
            },
            data: { status: 'RESOLVED', resolvedAt: new Date() },
          });
        }
        if (!difference.isZero()) {
          await this.prisma.db.reconciliationDifference.create({
            data: {
              runId: run.id,
              chainId: String(chain.id),
              fundDomain: domain.fundDomain,
              internalBalance: internal.toFixed(),
              externalBalance: external.toFixed(),
              difference: difference.toFixed(),
              severity,
            },
          });
        }
        results.push({
          fundDomain: domain.fundDomain,
          internal: internal.toFixed(),
          external: external.toFixed(),
          difference: difference.toFixed(),
          severity,
        });
      }
      const byDomain = new Map(results.map((result) => [result.fundDomain, result]));
      const bull = byDomain.get('BULL');
      const spot = byDomain.get('SPOT');
      const futures = byDomain.get('FUTURES');
      if (!bull || !spot || !futures) throw new Error('reconciliation did not produce all fund domains');
      const criticalCount = results.filter((result) => result.severity === 'CRITICAL').length;
      await this.prisma.db.reconciliationRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          status: criticalCount === 0 ? 'PASSED' : 'FAILED',
          bullInternal: bull.internal,
          bullExternal: bull.external,
          spotInternal: spot.internal,
          spotExternal: spot.external,
          futuresInternal: futures.internal,
          futuresExternal: futures.external,
          criticalCount,
        },
      });
      return results;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown reconciliation error';
      await this.prisma.db.reconciliationRun.update({
        where: { id: run.id },
        data: { finishedAt: new Date(), status: 'FAILED', error: message.slice(0, 1024) },
      });
      throw error;
    } finally {
      this.running = false;
    }
  }
}
