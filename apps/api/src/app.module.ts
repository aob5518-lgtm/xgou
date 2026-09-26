import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health.controller.js';
import { ReferralModule } from './referral/referral.module.js';
import { XpModule } from './xp/xp.module.js';
import { SystemConfigModule } from './config/system-config.module.js';
import { FundsModule } from './funds/funds.module.js';
import { ChainModule } from './chain/chain.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { SpotAgentModule } from './spot-agent/spot-agent.module.js';
import { FuturesAgentModule } from './futures-agent/futures-agent.module.js';
import { RewardsModule } from './rewards/rewards.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    DatabaseModule,
    ChainModule,
    SystemConfigModule,
    AuthModule,
    ReferralModule,
    XpModule,
    FundsModule,
    DashboardModule,
    SpotAgentModule,
    FuturesAgentModule,
    RewardsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
