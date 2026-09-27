import { Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AccessTokenGuard } from '../auth/access-token.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { BinanceSandboxService } from './binance-sandbox.service.js';

@Controller('admin/sandbox/binance')
@UseGuards(AccessTokenGuard)
export class BinanceSandboxController {
  constructor(private readonly sandbox: BinanceSandboxService) {}
  private authorize(user: AuthenticatedUser): void { if (!['ADMIN', 'RISK_MANAGER'].includes(user.role)) throw new ForbiddenException('admin or risk manager role required'); }
  @Get('readiness') readiness(@CurrentUser() user: AuthenticatedUser) { this.authorize(user); return this.sandbox.readiness(); }
  @Get('orders') orders(@CurrentUser() user: AuthenticatedUser) { this.authorize(user); return this.sandbox.orders(); }
  @Get('reconciliation') reconciliation(@CurrentUser() user: AuthenticatedUser) { this.authorize(user); return this.sandbox.reconciliation(); }
  @Get('recovery') recovery(@CurrentUser() user: AuthenticatedUser) { this.authorize(user); return this.sandbox.recoverable(); }
  @Post('enable/request') requestEnable(@CurrentUser() user: AuthenticatedUser) { this.authorize(user); return this.sandbox.requestEnable(user.userId); }
  @Post('enable') enable(@CurrentUser() user: AuthenticatedUser, @Body() body: { approvalRequestId?: string }) { this.authorize(user); if (!body.approvalRequestId) throw new Error('approvalRequestId is required'); return this.sandbox.enable(body.approvalRequestId, user.userId); }
  @Post('disable') disable(@CurrentUser() user: AuthenticatedUser, @Body() body: { reason?: string }) { this.authorize(user); return this.sandbox.disable(body.reason ?? 'MANUAL_DISABLE', user.userId); }
  @Post('emergency-stop') stop(@CurrentUser() user: AuthenticatedUser, @Body() body: { reason?: string }, @Req() request: Request) { this.authorize(user); return this.sandbox.emergencyStop(body.reason ?? String(request.headers['x-request-id'] ?? 'MANUAL_EMERGENCY_STOP'), user.userId); }
}
