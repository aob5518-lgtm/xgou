import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { planReferralBinding, ReferralBindingError } from '@xgou/referral-engine';
import { getAddress } from 'viem';
import { PrismaService } from '../database/prisma.service.js';
import type { AuditContext } from '../common/audit-context.js';
import { SystemConfigService } from '../config/system-config.service.js';

@Injectable()
export class ReferralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configs: SystemConfigService,
  ) {}

  async bind(userId: string, inviterWalletAddress: string, audit: AuditContext): Promise<{ inviterUserId: string }> {
    const normalized = getAddress(inviterWalletAddress.toLowerCase()).toLowerCase();
    try {
      return await this.prisma.db.$transaction(async (tx) => {
        const [user, inviter, existingEdge, participationCount] = await Promise.all([
          tx.user.findUnique({ where: { id: userId } }),
          tx.user.findUnique({ where: { walletAddress: normalized } }),
          tx.referralEdge.findUnique({ where: { userId } }),
          tx.participation.count({ where: { userId } }),
        ]);
        if (!user || !inviter) throw new NotFoundException('user or inviter not found');
        if (participationCount > 0) throw new ConflictException('inviter must be bound before first participation');

        const inviterAncestors = await tx.referralClosure.findMany({
          where: { descendantId: inviter.id },
          select: { ancestorId: true, descendantId: true, depth: true },
        });
        const closureRows = planReferralBinding(user.id, inviter.id, inviterAncestors, Boolean(existingEdge));
        await tx.referralEdge.create({ data: { userId: user.id, inviterUserId: inviter.id } });
        if (closureRows.length > 0) {
          await tx.referralClosure.createMany({ data: closureRows, skipDuplicates: false });
        }
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: 'REFERRAL.BIND_INVITER',
            target: `user:${user.id}`,
            before: { inviterUserId: null },
            after: { inviterUserId: inviter.id },
            ipHash: audit.ipHash,
            requestId: audit.requestId,
          },
        });
        return { inviterUserId: inviter.id };
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (error instanceof ReferralBindingError) throw new ConflictException(error.message);
      throw error;
    }
  }

  async tree(userId: string): Promise<readonly { userId: string; walletAddress: string; depth: number }[]> {
    const maxReferralDepth = (await this.configs.current()).values.maxReferralDepth;
    const rows = await this.prisma.db.referralClosure.findMany({
      where: { ancestorId: userId, depth: { gte: 1, lte: maxReferralDepth } },
      include: { descendant: { select: { walletAddress: true } } },
      orderBy: [{ depth: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => ({ userId: row.descendantId, walletAddress: row.descendant.walletAddress, depth: row.depth }));
  }
}
