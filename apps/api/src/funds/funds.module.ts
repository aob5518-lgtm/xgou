import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DepositController } from './deposit.controller.js';
import { DepositService } from './deposit.service.js';
import { ChainModule } from '../chain/chain.module.js';
import { DepositIndexer } from './deposit-indexer.service.js';
import { DepositSafetyService } from './deposit-safety.service.js';
import { ReconciliationService } from './reconciliation.service.js';

@Module({
  imports: [AuthModule, ChainModule],
  controllers: [DepositController],
  providers: [DepositService, DepositIndexer, DepositSafetyService, ReconciliationService],
  exports: [DepositService, DepositIndexer, ReconciliationService],
})
export class FundsModule {}
