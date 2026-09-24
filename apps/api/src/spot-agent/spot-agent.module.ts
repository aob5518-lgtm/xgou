import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { SystemConfigModule } from '../config/system-config.module.js';
import { RedisRuntimeService } from './redis-runtime.service.js';
import { SpotAgentController } from './spot-agent.controller.js';
import { SpotAgentService } from './spot-agent.service.js';
import { SpotAgentWorker } from './spot-agent.worker.js';

@Module({ imports: [AuthModule, DatabaseModule, SystemConfigModule], controllers: [SpotAgentController], providers: [RedisRuntimeService, SpotAgentService, SpotAgentWorker], exports: [SpotAgentService] })
export class SpotAgentModule {}
