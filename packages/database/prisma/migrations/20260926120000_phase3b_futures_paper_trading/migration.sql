ALTER TYPE "StrategyType" ADD VALUE 'FUTURES_TREND';
ALTER TYPE "SignalType" ADD VALUE 'LONG';
ALTER TYPE "SignalType" ADD VALUE 'SHORT';
ALTER TYPE "ProposalSide" ADD VALUE 'OPEN_LONG';
ALTER TYPE "ProposalSide" ADD VALUE 'OPEN_SHORT';
ALTER TYPE "ProposalSide" ADD VALUE 'REDUCE_LONG';
ALTER TYPE "ProposalSide" ADD VALUE 'REDUCE_SHORT';
ALTER TYPE "ProposalSide" ADD VALUE 'CLOSE_LONG';
ALTER TYPE "ProposalSide" ADD VALUE 'CLOSE_SHORT';
ALTER TYPE "PaperOrderStatus" ADD VALUE 'LIQUIDATED';
ALTER TYPE "PositionStatus" ADD VALUE 'FORCED_CLOSED';
ALTER TYPE "PositionStatus" ADD VALUE 'LIQUIDATED';

CREATE TYPE "FuturesPositionSide" AS ENUM ('LONG', 'SHORT');

ALTER TABLE "StrategyAccount"
  ADD COLUMN "equity" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "marginUsed" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "availableMargin" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "grossExposure" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "netExposure" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "fundingPnl" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "fees" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "consecutiveLosses" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "TradeProposal"
  ADD COLUMN "requestedLeverage" DECIMAL(18,8),
  ADD COLUMN "approvedLeverage" DECIMAL(18,8),
  ADD COLUMN "stopLoss" DECIMAL(36,18),
  ADD COLUMN "takeProfit" DECIMAL(36,18),
  ADD COLUMN "maxSlippage" DECIMAL(18,8),
  ADD COLUMN "reason" VARCHAR(256);

ALTER TABLE "PaperOrder"
  ADD COLUMN "leverage" DECIMAL(18,8),
  ADD COLUMN "reduceOnly" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "FuturesPosition" (
  "id" UUID NOT NULL,
  "strategyAccountId" UUID NOT NULL,
  "symbol" VARCHAR(24) NOT NULL,
  "priceSourcePair" VARCHAR(24) NOT NULL,
  "side" "FuturesPositionSide" NOT NULL,
  "status" "PositionStatus" NOT NULL DEFAULT 'OPEN',
  "quantity" DECIMAL(36,18) NOT NULL,
  "averageEntry" DECIMAL(36,18) NOT NULL,
  "markPrice" DECIMAL(36,18) NOT NULL,
  "leverage" DECIMAL(18,8) NOT NULL,
  "notional" DECIMAL(36,18) NOT NULL,
  "initialMargin" DECIMAL(36,18) NOT NULL,
  "maintenanceMargin" DECIMAL(36,18) NOT NULL,
  "liquidationPrice" DECIMAL(36,18) NOT NULL,
  "liquidationDistance" DECIMAL(18,8) NOT NULL,
  "realizedPnl" DECIMAL(36,18) NOT NULL DEFAULT 0,
  "unrealizedPnl" DECIMAL(36,18) NOT NULL DEFAULT 0,
  "fundingPnl" DECIMAL(36,18) NOT NULL DEFAULT 0,
  "fees" DECIMAL(36,18) NOT NULL DEFAULT 0,
  "stopLoss" DECIMAL(36,18) NOT NULL,
  "takeProfit" DECIMAL(36,18),
  "trailingStop" DECIMAL(36,18),
  "highestMarkPrice" DECIMAL(36,18),
  "lowestMarkPrice" DECIMAL(36,18),
  "markedAt" TIMESTAMP(3),
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FuturesPosition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FundingPayment" (
  "id" UUID NOT NULL,
  "positionId" UUID NOT NULL,
  "idempotencyKey" VARCHAR(160) NOT NULL,
  "fundingRate" DECIMAL(18,10) NOT NULL,
  "notional" DECIMAL(36,18) NOT NULL,
  "payment" DECIMAL(36,18) NOT NULL,
  "fundedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FundingPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FuturesLiquidation" (
  "id" UUID NOT NULL,
  "positionId" UUID NOT NULL,
  "cycleId" VARCHAR(128) NOT NULL,
  "liquidationPrice" DECIMAL(36,18) NOT NULL,
  "fillPrice" DECIMAL(36,18) NOT NULL,
  "penalty" DECIMAL(36,18) NOT NULL,
  "realizedLoss" DECIMAL(36,18) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FuturesLiquidation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FuturesPosition_strategyAccountId_symbol_key" ON "FuturesPosition"("strategyAccountId", "symbol");
CREATE INDEX "FuturesPosition_status_markedAt_idx" ON "FuturesPosition"("status", "markedAt");
CREATE UNIQUE INDEX "FundingPayment_idempotencyKey_key" ON "FundingPayment"("idempotencyKey");
CREATE INDEX "FundingPayment_positionId_fundedAt_idx" ON "FundingPayment"("positionId", "fundedAt");
CREATE UNIQUE INDEX "FuturesLiquidation_cycleId_key" ON "FuturesLiquidation"("cycleId");

ALTER TABLE "FuturesPosition" ADD CONSTRAINT "FuturesPosition_strategyAccountId_fkey" FOREIGN KEY ("strategyAccountId") REFERENCES "StrategyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FundingPayment" ADD CONSTRAINT "FundingPayment_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "FuturesPosition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FuturesLiquidation" ADD CONSTRAINT "FuturesLiquidation_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "FuturesPosition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
