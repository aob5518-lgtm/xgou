import { Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AccessTokenGuard } from '../auth/access-token.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { OperationsService, type ApiGlobalState } from './operations.service.js';

@Controller('admin/risk')
@UseGuards(AccessTokenGuard)
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}
  private authorize(user: AuthenticatedUser): void { if (!['ADMIN', 'RISK_MANAGER'].includes(user.role)) throw new ForbiddenException('admin or risk manager role required'); }
  private transition(state: ApiGlobalState, user: AuthenticatedUser, request: Request) { this.authorize(user); return this.operations.transition(state, user.userId, String(request.headers['x-request-id'] ?? crypto.randomUUID())); }
  @Get('production-readiness') readiness(@CurrentUser() user: AuthenticatedUser) { this.authorize(user); return this.operations.productionReadiness(); }
  @Post('global/pause') pause(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) { return this.transition('PAUSED', user, request); }
  @Post('global/reduce-only') reduce(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) { return this.transition('REDUCE_ONLY', user, request); }
  @Post('global/emergency-stop') stop(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) { return this.transition('EMERGENCY_STOP', user, request); }
  @Post('global/resume') resume(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) { return this.transition('ACTIVE', user, request); }
}
