import { Module } from '@nestjs/common';
import { SystemClock } from '@xgou/reward-engine';
import { AuthModule } from '../auth/auth.module.js';
import { RedisRuntimeService } from '../spot-agent/redis-runtime.service.js';
import { XpModule } from '../xp/xp.module.js';
import { RewardSettlementController } from './reward-settlement.controller.js';
import { RewardSettlementService } from './reward-settlement.service.js';
import { RewardSettlementWorker } from './reward-settlement.worker.js';

@Module({
  imports: [AuthModule, XpModule],
  controllers: [RewardSettlementController],
  providers: [
    RewardSettlementService,
    RewardSettlementWorker,
    RedisRuntimeService,
    { provide: 'REWARD_CLOCK', useFactory: () => new SystemClock() },
  ],
  exports: [RewardSettlementService],
})
export class RewardsModule {}
