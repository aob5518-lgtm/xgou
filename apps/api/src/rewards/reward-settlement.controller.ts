import { Controller, ForbiddenException, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { RewardSettlementService } from './reward-settlement.service.js';

@Controller()
@UseGuards(AccessTokenGuard)
export class RewardSettlementController {
  constructor(private readonly rewards: RewardSettlementService) {}

  @Get('rewards')
  getMine(@CurrentUser() user: AuthenticatedUser) { return this.rewards.userRewards(user.userId); }

  @Get('rewards/me')
  getMineAlias(@CurrentUser() user: AuthenticatedUser) { return this.rewards.userRewards(user.userId); }

  @Get('rewards/epochs/current')
  current() { return this.rewards.currentEpoch(); }

  @Get('rewards/epochs')
  list() { return this.rewards.listEpochs(); }

  @Get('rewards/epochs/:id')
  epoch(@Param('id') id: string) { return this.rewards.epoch(id); }

  @Get('admin/rewards/epochs/:id/review')
  review(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    this.assertReviewer(user);
    return this.rewards.review(id);
  }

  @Post('admin/rewards/epochs/:id/calculate')
  calculate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    this.assertReviewer(user);
    return this.rewards.calculate(id, user.userId);
  }

  @Post('admin/rewards/epochs/:id/finalize')
  finalize(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    this.assertReviewer(user);
    return this.rewards.finalize(id, user.userId);
  }

  @Post('admin/rewards/epochs/:id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    this.assertReviewer(user);
    return this.rewards.cancel(id, user.userId);
  }

  private assertReviewer(user: AuthenticatedUser): void {
    if (!['ADMIN', 'RISK_MANAGER'].includes(user.role)) throw new ForbiddenException('admin or risk manager role required');
  }
}
