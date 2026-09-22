import { Controller, Get, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { XpService, type XpSummary } from './xp.service.js';

@Controller('xp')
@UseGuards(AccessTokenGuard)
export class XpController {
  constructor(private readonly xp: XpService) {}

  @Get('me')
  summary(@CurrentUser() user: AuthenticatedUser): Promise<XpSummary> {
    return this.xp.summary(user.userId);
  }
}
