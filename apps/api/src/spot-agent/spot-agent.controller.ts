import { Controller, Get, Param, Post, ForbiddenException, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { SpotAgentService } from './spot-agent.service.js';

@Controller()
@UseGuards(AccessTokenGuard)
export class SpotAgentController {
  constructor(private readonly agent: SpotAgentService) {}
  @Get('agent/spot') getSpot() { return this.agent.snapshot(); }
  @Get('activities') getActivities() { return this.agent.activities(); }
  @Post('admin/agent/spot/:action')
  async change(@Param('action') action: string, @CurrentUser() user: AuthenticatedUser) {
    if (!['ADMIN', 'RISK_MANAGER'].includes(user.role)) throw new ForbiddenException('admin or risk manager role required');
    const state = action === 'resume' ? 'PAPER' : action === 'pause' ? 'PAUSED' : action === 'risk-off' ? 'RISK_OFF' : null;
    if (!state) throw new ForbiddenException('unsupported agent action');
    await this.agent.setState(state, user.userId);
    return { status: state, mode: 'PAPER' };
  }
}
