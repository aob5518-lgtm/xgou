import { Controller, ForbiddenException, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { FuturesAgentService } from './futures-agent.service.js';

@Controller()
@UseGuards(AccessTokenGuard)
export class FuturesAgentController {
  constructor(private readonly agent: FuturesAgentService) {}
  @Get('agent/futures') getFutures() { return this.agent.snapshot(); }
  @Post('admin/agent/futures/:action')
  async change(@Param('action') action: string, @CurrentUser() user: AuthenticatedUser) {
    if (!['ADMIN', 'RISK_MANAGER'].includes(user.role)) throw new ForbiddenException('admin or risk manager role required');
    const state = action === 'resume' ? 'PAPER' : action === 'pause' ? 'PAUSED' : action === 'risk-off' ? 'RISK_OFF' : null;
    if (!state) throw new ForbiddenException('unsupported agent action');
    await this.agent.setState(state, user.userId);
    return { status: state, mode: 'PAPER' };
  }
}
