import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { XpController } from './xp.controller.js';
import { XpService } from './xp.service.js';

@Module({ imports: [AuthModule], controllers: [XpController], providers: [XpService] })
export class XpModule {}
