import { Injectable } from '@nestjs/common';
import { BinanceApiError, normalizeBinanceOrderStatus, type BinanceOrderResponse } from '@xgou/exchange-adapters';
import { PrismaService } from '../database/prisma.service.js';
import { BinanceSandboxService } from './binance-sandbox.service.js';

export interface BinanceSandboxOrderTransport {
  submit(exchangeClientOrderId: string): Promise<BinanceOrderResponse>;
  query(exchangeClientOrderId: string): Promise<BinanceOrderResponse | null>;
}

type ReserveInput = Parameters<BinanceSandboxService['reserveOrder']>[0];

@Injectable()
export class BinanceSandboxExecutionService {
  constructor(private readonly prisma: PrismaService, private readonly sandbox: BinanceSandboxService) {}

  async execute(input: ReserveInput, transport: BinanceSandboxOrderTransport) {
    const order = await this.sandbox.reserveOrder(input);
    if (order.networkSent) return order;
    const claimed = await this.prisma.db.sandboxOrder.updateMany({ where: { id: order.id, networkSent: false, state: 'AUTHORIZED' }, data: { networkSent: true, state: 'SUBMITTING' } });
    if (claimed.count !== 1) return this.prisma.db.sandboxOrder.findUniqueOrThrow({ where: { id: order.id } });
    await this.prisma.db.sandboxExecutionLedger.create({ data: { orderId: order.id, eventType: 'NETWORK_SUBMISSION_STARTED', stateBefore: 'AUTHORIZED', stateAfter: 'SUBMITTING', details: { exchangeClientOrderId: order.exchangeClientOrderId } } });
    try {
      const response = await transport.submit(order.exchangeClientOrderId);
      const state = normalizeBinanceOrderStatus(response.status);
      return await this.prisma.db.$transaction(async (tx) => {
        const updated = await tx.sandboxOrder.update({ where: { id: order.id }, data: { exchangeOrderId: String(response.orderId), state, lastQueriedAt: new Date() } });
        await tx.sandboxExecutionLedger.create({ data: { orderId: order.id, eventType: 'EXCHANGE_ACKNOWLEDGED', stateBefore: 'SUBMITTING', stateAfter: state, details: { exchangeOrderId: String(response.orderId), status: response.status } } });
        return updated;
      });
    } catch (error) {
      const unknown = error instanceof BinanceApiError && error.executionUnknown;
      const state = unknown ? 'UNKNOWN' : 'REJECTED';
      await this.prisma.db.$transaction([
        this.prisma.db.sandboxOrder.update({ where: { id: order.id }, data: { state, unknownReason: error instanceof Error ? error.message.slice(0, 512) : 'exchange request failed' } }),
        this.prisma.db.sandboxExecutionLedger.create({ data: { orderId: order.id, eventType: unknown ? 'OUTCOME_UNKNOWN' : 'EXCHANGE_REJECTED', stateBefore: 'SUBMITTING', stateAfter: state, details: { retryAttempted: false } } }),
      ]);
      throw error;
    }
  }

  async recoverUnknown(transport: BinanceSandboxOrderTransport): Promise<number> {
    const orders = await this.prisma.db.sandboxOrder.findMany({ where: { state: { in: ['UNKNOWN', 'RECONCILIATION_REQUIRED'] } }, orderBy: { createdAt: 'asc' } });
    let recovered = 0;
    for (const order of orders) {
      const response = await transport.query(order.exchangeClientOrderId);
      if (!response) {
        await this.prisma.db.sandboxOrder.update({ where: { id: order.id }, data: { state: 'RECONCILIATION_REQUIRED', recoveryCount: { increment: 1 }, lastQueriedAt: new Date() } });
        continue;
      }
      const state = normalizeBinanceOrderStatus(response.status);
      await this.prisma.db.$transaction([
        this.prisma.db.sandboxOrder.update({ where: { id: order.id }, data: { exchangeOrderId: String(response.orderId), state, recoveryCount: { increment: 1 }, lastQueriedAt: new Date(), unknownReason: null } }),
        this.prisma.db.sandboxExecutionLedger.create({ data: { orderId: order.id, eventType: 'UNKNOWN_RECOVERED', stateBefore: order.state, stateAfter: state, details: { exchangeOrderId: String(response.orderId), queriedByClientOrderId: true } } }),
      ]);
      recovered += 1;
    }
    return recovered;
  }
}
