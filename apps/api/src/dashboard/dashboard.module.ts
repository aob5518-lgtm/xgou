import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ChainModule } from '../chain/chain.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({ imports: [AuthModule, ChainModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
