import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { bindInviterSchema } from '@xgou/shared';
import { AccessTokenGuard } from '../auth/access-token.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { parseBody } from '../common/zod.js';
import { auditContextFromRequest } from '../common/audit-context.js';
import { ReferralService } from './referral.service.js';

@Controller('referrals')
@UseGuards(AccessTokenGuard)
export class ReferralController {
  constructor(private readonly referrals: ReferralService) {}

  @Post('bind')
  bind(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<{ inviterUserId: string }> {
    const input = parseBody(bindInviterSchema, body);
    return this.referrals.bind(user.userId, input.inviterWalletAddress, auditContextFromRequest(request));
  }

  @Get('tree')
  tree(@CurrentUser() user: AuthenticatedUser): Promise<readonly { userId: string; walletAddress: string; depth: number }[]> {
    return this.referrals.tree(user.userId);
  }
}
