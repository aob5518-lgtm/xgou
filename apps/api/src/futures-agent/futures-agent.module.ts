import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { SystemConfigModule } from '../config/system-config.module.js';
import { RedisRuntimeService } from '../spot-agent/redis-runtime.service.js';
import { FuturesAgentController } from './futures-agent.controller.js';
import { FuturesAgentService } from './futures-agent.service.js';
import { FuturesAgentWorker } from './futures-agent.worker.js';

@Module({ imports: [AuthModule, DatabaseModule, SystemConfigModule], controllers: [FuturesAgentController], providers: [RedisRuntimeService, FuturesAgentService, FuturesAgentWorker], exports: [FuturesAgentService] })
export class FuturesAgentModule {}
