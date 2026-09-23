import { Injectable } from '@nestjs/common';
import { calculateXp } from '@xgou/xp-engine';
import { Decimal } from 'decimal.js';
import { PrismaService } from '../database/prisma.service.js';
import { SystemConfigService } from '../config/system-config.service.js';

export interface XpSummary {
  readonly principalXp: string;
  readonly dynamicXp: string;
  readonly totalXp: string;
  readonly directValidReferralCount: number;
  readonly eligibleForDynamicXp: boolean;
  readonly unlockedDepth: number;
  readonly networkPrincipalXp: string;
}

@Injectable()
export class XpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configs: SystemConfigService,
  ) {}

  async summary(userId: string): Promise<XpSummary> {
    const config = (await this.configs.current()).values;
    const [ownAggregate, ownParticipations, directEdges, closure] = await Promise.all([
      this.prisma.db.principalXpEntry.aggregate({ where: { userId }, _sum: { amount: true } }),
      this.prisma.db.participation.findMany({
        where: { userId, status: 'EFFECTIVE' },
        select: { amount: true },
      }),
      this.prisma.db.referralEdge.findMany({
        where: { inviterUserId: userId },
        include: { user: { include: { participations: { where: { status: 'EFFECTIVE' }, select: { amount: true } } } } },
      }),
      this.prisma.db.referralClosure.findMany({
        where: { ancestorId: userId, depth: { gte: 1, lte: config.maxReferralDepth } },
        select: { descendantId: true, depth: true },
      }),
    ]);

    const threshold = new Decimal(config.minReferralQualification);
    const effectiveParticipation = ownParticipations.reduce(
      (sum, item) => sum.plus(item.amount.toString()),
      new Decimal(0),
    );
    const eligibleForDynamicXp = effectiveParticipation.gte(threshold);
    const qualifiedDirectCount = directEdges.filter((edge) =>
      edge.user.participations.reduce((sum, item) => sum.plus(item.amount.toString()), new Decimal(0)).gte(threshold),
    ).length;
    const directValidReferralCount = eligibleForDynamicXp ? qualifiedDirectCount : 0;

    const descendantIds = closure.map((row) => row.descendantId);
    const descendantXp = descendantIds.length === 0
      ? []
      : await this.prisma.db.principalXpEntry.groupBy({
          by: ['userId'],
          where: { userId: { in: descendantIds } },
          _sum: { amount: true },
        });
    const xpByUser = new Map(descendantXp.map((row) => [row.userId, row._sum.amount?.toString() ?? '0']));
    const calculated = calculateXp(
      ownAggregate._sum.amount?.toString() ?? '0',
      directValidReferralCount,
      closure.map((row) => ({ depth: row.depth, principalXp: xpByUser.get(row.descendantId) ?? '0' })),
      config,
    );
    return {
      principalXp: calculated.principalXp.toFixed(),
      dynamicXp: calculated.dynamicXp.toFixed(),
      totalXp: calculated.totalXp.toFixed(),
      directValidReferralCount,
      eligibleForDynamicXp,
      unlockedDepth: calculated.unlockedDepth,
      networkPrincipalXp: calculated.networkPrincipalXp.toFixed(),
    };
  }
}
