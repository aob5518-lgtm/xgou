import { Module } from '@nestjs/common';
import { OperationsController } from './operations.controller.js';
import { OperationsService } from './operations.service.js';
import { ProductionReadinessService, RoleReadinessService } from './readiness.js';
import { TreasuryDryRunService } from './treasury-dry-run.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { DatabaseGlobalTradingStateStore } from './database-global-trading-state.store.js';
import { PersistentExecutionService, PersistentOrderRecoveryWorker } from './persistent-execution.service.js';
import { PersistentOperationalRiskService } from './persistent-operational-risk.service.js';
import { ProductionReadinessCollector } from './production-readiness.collector.js';
import { RuntimeAlertService } from './runtime-alert.service.js';
import { BinanceSandboxController } from './binance-sandbox.controller.js';
import { BinanceSandboxService } from './binance-sandbox.service.js';
import { BinanceReconciliationService } from './binance-reconciliation.service.js';
import { BinanceSandboxExecutionService } from './binance-sandbox-execution.service.js';

const runtimeProviders = [DatabaseGlobalTradingStateStore, PersistentExecutionService, PersistentOrderRecoveryWorker, PersistentOperationalRiskService, ProductionReadinessCollector, RuntimeAlertService, BinanceSandboxService, BinanceReconciliationService, BinanceSandboxExecutionService];

@Module({ imports: [AuthModule, DatabaseModule], controllers: [OperationsController, BinanceSandboxController], providers: [OperationsService, ProductionReadinessService, RoleReadinessService, TreasuryDryRunService, ...runtimeProviders], exports: [OperationsService, ProductionReadinessService, RoleReadinessService, TreasuryDryRunService, ...runtimeProviders] })
export class OperationsModule {}
