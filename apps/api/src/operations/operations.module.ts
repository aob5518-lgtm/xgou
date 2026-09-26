import { Module } from '@nestjs/common';
import { OperationsController } from './operations.controller.js';
import { OperationsService } from './operations.service.js';
import { ProductionReadinessService, RoleReadinessService } from './readiness.js';
import { TreasuryDryRunService } from './treasury-dry-run.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';

@Module({ imports: [AuthModule, DatabaseModule], controllers: [OperationsController], providers: [OperationsService, ProductionReadinessService, RoleReadinessService, TreasuryDryRunService], exports: [OperationsService, ProductionReadinessService, RoleReadinessService, TreasuryDryRunService] })
export class OperationsModule {}
