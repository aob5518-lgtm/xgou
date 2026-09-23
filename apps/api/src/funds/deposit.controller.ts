import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { createDepositSchema } from '@xgou/shared';
import type { Request } from 'express';
import { AccessTokenGuard } from '../auth/access-token.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { auditContextFromRequest } from '../common/audit-context.js';
import { parseBody } from '../common/zod.js';
import { DepositService, type DepositView } from './deposit.service.js';

@Controller('funds/deposits')
@UseGuards(AccessTokenGuard)
export class DepositController {
  constructor(private readonly deposits: DepositService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<DepositView> {
    return this.deposits.create(user.userId, parseBody(createDepositSchema, body), auditContextFromRequest(request));
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<readonly DepositView[]> {
    return this.deposits.list(user.userId);
  }
}
