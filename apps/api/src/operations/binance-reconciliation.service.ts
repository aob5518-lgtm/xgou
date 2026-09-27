import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { PrismaService } from '../database/prisma.service.js';
import { BinanceSandboxService } from './binance-sandbox.service.js';
import { DatabaseGlobalTradingStateStore } from './database-global-trading-state.store.js';

export interface BinanceReconciliationValue {
  readonly category: 'BALANCE' | 'ORDER' | 'FILL' | 'POSITION';
  readonly referenceId: string;
  readonly internal: string;
  readonly external: string;
}

@Injectable()
export class BinanceReconciliationService {
  constructor(private readonly prisma: PrismaService, private readonly sandbox: BinanceSandboxService, private readonly globalState: DatabaseGlobalTradingStateStore) {}

  async reconcile(accountType: 'SPOT' | 'FUTURES', values: readonly BinanceReconciliationValue[], dust = process.env.BINANCE_RECONCILIATION_DUST ?? '0.00000001') {
    const run = await this.prisma.db.sandboxReconciliationRun.create({ data: { accountType } });
    try {
      const differences = values.flatMap((value) => {
        const difference = new Decimal(value.internal).minus(value.external).abs();
        if (difference.lte(dust)) return [];
        return [{ ...value, severity: 'CRITICAL' as const }];
      });
      if (differences.length) await this.prisma.db.sandboxReconciliationDifference.createMany({ data: differences.map((value) => ({ runId: run.id, category: value.category, referenceId: value.referenceId, internal: { value: value.internal }, external: { value: value.external }, severity: value.severity })) });
      const finished = await this.prisma.db.sandboxReconciliationRun.update({ where: { id: run.id }, data: { status: differences.length ? 'FAILED' : 'PASSED', criticalCount: differences.length, finishedAt: new Date() } });
      if (differences.length) {
        const reason = `BINANCE_SANDBOX_RECONCILIATION:${run.id}`;
        await Promise.all([
          this.sandbox.disable(reason, 'binance-reconciliation-worker'),
          this.globalState.set('EMERGENCY_STOP', false, reason, 'binance-reconciliation-worker'),
          this.prisma.db.incident.create({ data: { severity: 'CRITICAL', type: 'BINANCE_SANDBOX_RECONCILIATION', summary: `${String(differences.length)} critical Binance sandbox mismatch(es)`, details: { runId: run.id, accountType, references: differences.map((row) => row.referenceId) }, linkedRiskEvents: [] } }),
        ]);
      }
      return finished;
    } catch (error) {
      await this.prisma.db.sandboxReconciliationRun.update({ where: { id: run.id }, data: { status: 'FAILED', finishedAt: new Date(), error: error instanceof Error ? error.message.slice(0, 1024) : 'unknown reconciliation error' } });
      throw error;
    }
  }
}
