import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DepositController } from './deposit.controller.js';
import { DepositService } from './deposit.service.js';

@Module({ imports: [AuthModule], controllers: [DepositController], providers: [DepositService], exports: [DepositService] })
export class FundsModule {}
