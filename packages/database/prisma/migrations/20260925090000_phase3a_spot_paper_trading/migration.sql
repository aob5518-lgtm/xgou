-- CreateEnum
CREATE TYPE "StrategyType" AS ENUM ('SPOT_SWING');

-- CreateEnum
CREATE TYPE "StrategyStatus" AS ENUM ('DRAFT', 'PAPER', 'PAUSED', 'RISK_OFF', 'DISABLED');

-- CreateEnum
CREATE TYPE "StrategyAccountStatus" AS ENUM ('ACTIVE', 'PAUSED', 'RISK_OFF');

-- CreateEnum
CREATE TYPE "SignalType" AS ENUM ('BUY', 'REDUCE', 'EXIT', 'HOLD');

-- CreateEnum
CREATE TYPE "ProposalSide" AS ENUM ('BUY', 'REDUCE', 'EXIT');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('CREATED', 'RISK_APPROVED', 'RISK_REDUCED', 'RISK_REJECTED', 'EXECUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RiskDecisionType" AS ENUM ('APPROVED', 'REDUCED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaperOrderStatus" AS ENUM ('CREATED', 'RISK_APPROVED', 'SUBMITTED', 'FILLED', 'PARTIALLY_FILLED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaperOrderType" AS ENUM ('MARKET', 'LIMIT');

-- CreateEnum
CREATE TYPE "PaperSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CircuitBreakerStatus" AS ENUM ('RUNNING', 'REDUCED_RISK', 'PAUSED', 'RISK_OFF');

-- CreateEnum
CREATE TYPE "StrategyCycleStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "StrategyActivityType" AS ENUM ('RESEARCH', 'SIGNAL', 'PROPOSAL', 'RISK', 'EXECUTION', 'SYSTEM');

-- CreateTable
CREATE TABLE "Strategy" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "type" "StrategyType" NOT NULL,
    "fundDomain" "FundDomain" NOT NULL DEFAULT 'SPOT',
    "status" "StrategyStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "riskProfile" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyVersion" (
    "id" UUID NOT NULL,
    "strategyId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "parameters" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyAccount" (
    "id" UUID NOT NULL,
    "strategyId" UUID NOT NULL,
    "status" "StrategyAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "asset" VARCHAR(12) NOT NULL DEFAULT 'USDC',
    "allocatedCapital" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "activeCapital" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "cashBalance" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "reserveBalance" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "nav" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "highWaterMark" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "realizedPnl" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "unrealizedPnl" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "dailyPnl" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "drawdown" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyAllocation" (
    "id" UUID NOT NULL,
    "strategyAccountId" UUID NOT NULL,
    "symbol" VARCHAR(16) NOT NULL,
    "targetWeight" DECIMAL(18,8) NOT NULL,
    "maxWeight" DECIMAL(18,8) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StrategyAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyCycle" (
    "id" UUID NOT NULL,
    "strategyId" UUID NOT NULL,
    "cycleId" VARCHAR(128) NOT NULL,
    "status" "StrategyCycleStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" VARCHAR(1024),

    CONSTRAINT "StrategyCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeSignal" (
    "id" UUID NOT NULL,
    "strategyId" UUID NOT NULL,
    "cycleId" VARCHAR(128) NOT NULL,
    "symbol" VARCHAR(16) NOT NULL,
    "type" "SignalType" NOT NULL,
    "strength" DECIMAL(18,8) NOT NULL,
    "price" DECIMAL(36,18) NOT NULL,
    "indicators" JSONB NOT NULL,
    "rationale" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeProposal" (
    "id" UUID NOT NULL,
    "strategyId" UUID NOT NULL,
    "signalId" UUID NOT NULL,
    "cycleId" VARCHAR(128) NOT NULL,
    "symbol" VARCHAR(16) NOT NULL,
    "side" "ProposalSide" NOT NULL,
    "requestedNotional" DECIMAL(36,18) NOT NULL,
    "approvedNotional" DECIMAL(36,18),
    "referencePrice" DECIMAL(36,18) NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskDecision" (
    "id" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "decision" "RiskDecisionType" NOT NULL,
    "requestedNotional" DECIMAL(36,18) NOT NULL,
    "approvedNotional" DECIMAL(36,18) NOT NULL,
    "reasonCodes" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperOrder" (
    "id" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "riskDecisionId" UUID NOT NULL,
    "cycleId" VARCHAR(128) NOT NULL,
    "symbol" VARCHAR(16) NOT NULL,
    "side" "PaperSide" NOT NULL,
    "type" "PaperOrderType" NOT NULL DEFAULT 'MARKET',
    "status" "PaperOrderStatus" NOT NULL DEFAULT 'CREATED',
    "quantity" DECIMAL(36,18) NOT NULL,
    "notional" DECIMAL(36,18) NOT NULL,
    "referencePrice" DECIMAL(36,18) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaperOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperExecution" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "fillPrice" DECIMAL(36,18) NOT NULL,
    "quantity" DECIMAL(36,18) NOT NULL,
    "grossNotional" DECIMAL(36,18) NOT NULL,
    "fee" DECIMAL(36,18) NOT NULL,
    "slippageBps" DECIMAL(18,8) NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaperExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" UUID NOT NULL,
    "strategyAccountId" UUID NOT NULL,
    "symbol" VARCHAR(16) NOT NULL,
    "status" "PositionStatus" NOT NULL DEFAULT 'OPEN',
    "quantity" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "averageEntry" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "markPrice" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "marketValue" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "realizedPnl" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "unrealizedPnl" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionLot" (
    "id" UUID NOT NULL,
    "positionId" UUID NOT NULL,
    "quantity" DECIMAL(36,18) NOT NULL,
    "entryPrice" DECIMAL(36,18) NOT NULL,
    "fee" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "PositionLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyPnL" (
    "id" UUID NOT NULL,
    "strategyAccountId" UUID NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "realizedPnl" DECIMAL(36,18) NOT NULL,
    "unrealizedPnl" DECIMAL(36,18) NOT NULL,
    "fees" DECIMAL(36,18) NOT NULL,
    "nav" DECIMAL(36,18) NOT NULL,

    CONSTRAINT "StrategyPnL_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NavSnapshot" (
    "id" UUID NOT NULL,
    "strategyAccountId" UUID NOT NULL,
    "nav" DECIMAL(36,18) NOT NULL,
    "cash" DECIMAL(36,18) NOT NULL,
    "reserve" DECIMAL(36,18) NOT NULL,
    "exposure" DECIMAL(36,18) NOT NULL,
    "realizedPnl" DECIMAL(36,18) NOT NULL,
    "unrealizedPnl" DECIMAL(36,18) NOT NULL,
    "drawdown" DECIMAL(18,8) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NavSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketDataSnapshot" (
    "id" UUID NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "symbol" VARCHAR(16) NOT NULL,
    "timeframe" VARCHAR(16) NOT NULL,
    "price" DECIMAL(36,18) NOT NULL,
    "payload" JSONB NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "staleAfter" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketDataSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskEvent" (
    "id" UUID NOT NULL,
    "strategyId" UUID,
    "severity" "ReconciliationSeverity" NOT NULL,
    "code" VARCHAR(128) NOT NULL,
    "message" VARCHAR(512) NOT NULL,
    "details" JSONB NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CircuitBreakerState" (
    "id" UUID NOT NULL,
    "strategyId" UUID NOT NULL,
    "status" "CircuitBreakerStatus" NOT NULL DEFAULT 'RUNNING',
    "reason" VARCHAR(512),
    "triggeredAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CircuitBreakerState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetConfig" (
    "id" UUID NOT NULL,
    "symbol" VARCHAR(16) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "quoteAsset" VARCHAR(12) NOT NULL DEFAULT 'USDC',
    "maxWeight" DECIMAL(18,8) NOT NULL,
    "minOrderNotional" DECIMAL(36,18) NOT NULL,
    "priceDecimals" INTEGER NOT NULL,
    "quantityDecimals" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyActivity" (
    "id" UUID NOT NULL,
    "strategyId" UUID,
    "type" "StrategyActivityType" NOT NULL,
    "agentName" VARCHAR(64) NOT NULL,
    "message" VARCHAR(512) NOT NULL,
    "status" VARCHAR(64) NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyShare" (
    "id" UUID NOT NULL,
    "strategyId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "totalShares" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Strategy_code_key" ON "Strategy"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyVersion_strategyId_version_key" ON "StrategyVersion"("strategyId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyAccount_strategyId_key" ON "StrategyAccount"("strategyId");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyAllocation_strategyAccountId_symbol_key" ON "StrategyAllocation"("strategyAccountId", "symbol");

-- CreateIndex
CREATE INDEX "StrategyCycle_status_startedAt_idx" ON "StrategyCycle"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyCycle_strategyId_cycleId_key" ON "StrategyCycle"("strategyId", "cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeSignal_strategyId_cycleId_symbol_key" ON "TradeSignal"("strategyId", "cycleId", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "TradeProposal_signalId_key" ON "TradeProposal"("signalId");

-- CreateIndex
CREATE INDEX "TradeProposal_strategyId_createdAt_idx" ON "TradeProposal"("strategyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RiskDecision_proposalId_key" ON "RiskDecision"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "PaperOrder_proposalId_key" ON "PaperOrder"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "PaperOrder_riskDecisionId_key" ON "PaperOrder"("riskDecisionId");

-- CreateIndex
CREATE INDEX "PaperOrder_status_createdAt_idx" ON "PaperOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PaperExecution_orderId_executedAt_idx" ON "PaperExecution"("orderId", "executedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Position_strategyAccountId_symbol_key" ON "Position"("strategyAccountId", "symbol");

-- CreateIndex
CREATE INDEX "PositionLot_positionId_openedAt_idx" ON "PositionLot"("positionId", "openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyPnL_strategyAccountId_periodStart_periodEnd_key" ON "StrategyPnL"("strategyAccountId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "NavSnapshot_strategyAccountId_capturedAt_idx" ON "NavSnapshot"("strategyAccountId", "capturedAt");

-- CreateIndex
CREATE INDEX "MarketDataSnapshot_symbol_observedAt_idx" ON "MarketDataSnapshot"("symbol", "observedAt");

-- CreateIndex
CREATE INDEX "RiskEvent_severity_createdAt_idx" ON "RiskEvent"("severity", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CircuitBreakerState_strategyId_key" ON "CircuitBreakerState"("strategyId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetConfig_symbol_key" ON "AssetConfig"("symbol");

-- CreateIndex
CREATE INDEX "StrategyActivity_createdAt_idx" ON "StrategyActivity"("createdAt");

-- CreateIndex
CREATE INDEX "StrategyShare_strategyId_idx" ON "StrategyShare"("strategyId");

-- AddForeignKey
ALTER TABLE "StrategyVersion" ADD CONSTRAINT "StrategyVersion_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyAccount" ADD CONSTRAINT "StrategyAccount_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyAllocation" ADD CONSTRAINT "StrategyAllocation_strategyAccountId_fkey" FOREIGN KEY ("strategyAccountId") REFERENCES "StrategyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyCycle" ADD CONSTRAINT "StrategyCycle_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeSignal" ADD CONSTRAINT "TradeSignal_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeProposal" ADD CONSTRAINT "TradeProposal_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeProposal" ADD CONSTRAINT "TradeProposal_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "TradeSignal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskDecision" ADD CONSTRAINT "RiskDecision_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "TradeProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperOrder" ADD CONSTRAINT "PaperOrder_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "TradeProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperOrder" ADD CONSTRAINT "PaperOrder_riskDecisionId_fkey" FOREIGN KEY ("riskDecisionId") REFERENCES "RiskDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperExecution" ADD CONSTRAINT "PaperExecution_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PaperOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_strategyAccountId_fkey" FOREIGN KEY ("strategyAccountId") REFERENCES "StrategyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionLot" ADD CONSTRAINT "PositionLot_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyPnL" ADD CONSTRAINT "StrategyPnL_strategyAccountId_fkey" FOREIGN KEY ("strategyAccountId") REFERENCES "StrategyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NavSnapshot" ADD CONSTRAINT "NavSnapshot_strategyAccountId_fkey" FOREIGN KEY ("strategyAccountId") REFERENCES "StrategyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircuitBreakerState" ADD CONSTRAINT "CircuitBreakerState_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyActivity" ADD CONSTRAINT "StrategyActivity_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

