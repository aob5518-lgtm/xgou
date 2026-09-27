import { Injectable } from '@nestjs/common';
import type { GlobalTradingState, GlobalTradingStateStore } from '@xgou/exchange-adapters';
import { PrismaService } from '../database/prisma.service.js';

const GLOBAL_CONTROL_ID = 'GLOBAL';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface GlobalTradingControlSnapshot {
  readonly state: GlobalTradingState;
  readonly reason: string;
  readonly manualResumeRequired: boolean;
  readonly triggeredBy: string | null;
  readonly triggeredAt: Date | null;
  readonly updatedAt: Date;
  readonly version: number;
}

@Injectable()
export class DatabaseGlobalTradingStateStore implements GlobalTradingStateStore {
  constructor(private readonly prisma: PrismaService) {}

  async read(): Promise<GlobalTradingControlSnapshot> {
    const control = await this.prisma.db.globalTradingControl.upsert({
      where: { id: GLOBAL_CONTROL_ID },
      create: { id: GLOBAL_CONTROL_ID, state: 'ACTIVE', reason: 'INITIALIZED' },
      update: {},
    });
    return control;
  }

  async get(): Promise<GlobalTradingState> {
    return (await this.read()).state;
  }

  async set(state: GlobalTradingState, manual: boolean, reason = 'OPERATOR_TRANSITION', triggeredBy = 'system', requestId: string = crypto.randomUUID()): Promise<void> {
    await this.prisma.db.$transaction(async (tx) => {
      const current = await tx.globalTradingControl.upsert({
        where: { id: GLOBAL_CONTROL_ID },
        create: { id: GLOBAL_CONTROL_ID, state: 'ACTIVE', reason: 'INITIALIZED' },
        update: {},
      });
      if (current.state === 'EMERGENCY_STOP' && state === 'ACTIVE' && !manual) {
        throw new Error('EMERGENCY_STOP requires authorized manual resume');
      }
      const now = new Date();
      await tx.globalTradingControl.update({
        where: { id: GLOBAL_CONTROL_ID },
        data: {
          state,
          reason,
          manualResumeRequired: state === 'EMERGENCY_STOP',
          triggeredBy,
          triggeredAt: state === 'ACTIVE' ? null : now,
          version: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: UUID.test(triggeredBy) ? triggeredBy : null,
          action: `GLOBAL_TRADING_${state}`,
          target: 'GlobalTradingControl',
          before: { state: current.state, version: current.version },
          after: { state, reason, manual, version: current.version + 1 },
          requestId,
        },
      });
      if (state === 'EMERGENCY_STOP') {
        await tx.incident.create({
          data: {
            severity: 'EMERGENCY',
            type: 'GLOBAL_EMERGENCY_STOP',
            summary: reason,
            details: { previousState: current.state, state, triggeredBy, requestId },
            linkedRiskEvents: [],
          },
        });
      }
    });
  }
}
