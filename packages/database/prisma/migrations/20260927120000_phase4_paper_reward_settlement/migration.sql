CREATE TYPE "RewardMode" AS ENUM ('PAPER', 'REAL');
CREATE TYPE "RewardEpochStatus" AS ENUM ('OPEN', 'CALCULATING', 'REVIEW', 'FINALIZED', 'CANCELLED');
CREATE TYPE "UserRewardStatus" AS ENUM ('PENDING', 'AVAILABLE', 'WITHDRAWN', 'CANCELLED');

DROP INDEX IF EXISTS "RewardEpoch_number_key";
ALTER TABLE "RewardEpoch"
  ADD COLUMN "status" "RewardEpochStatus" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "mode" "RewardMode" NOT NULL DEFAULT 'PAPER',
  ADD COLUMN "configVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "spotStartNav" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "spotEndNav" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "spotRealizedGross" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "spotFees" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "spotSlippage" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "spotNetRealized" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "futuresStartNav" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "futuresEndNav" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "futuresRealizedGross" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "futuresFunding" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "futuresFees" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "futuresLiquidationPenalty" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "futuresSlippage" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "futuresNetRealized" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "grossNetRealized" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "lossCarryforwardBefore" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "lossCarryforwardApplied" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "lossCarryforwardAfter" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "hwmBefore" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "hwmAfter" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "distributableProfit" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "riskReserve" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "rewardPool" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "totalEffectiveXp" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "rewardDust" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "error" VARCHAR(1024),
  ADD COLUMN "settledAt" TIMESTAMP(3),
  ADD COLUMN "finalizedAt" TIMESTAMP(3);

ALTER TABLE "StrategyAccount"
  ADD COLUMN "grossRealizedPnl" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "netRealizedPnl" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "slippageCost" DECIMAL(36,18) NOT NULL DEFAULT 0,
  ADD COLUMN "liquidationPenalty" DECIMAL(36,18) NOT NULL DEFAULT 0;

ALTER TABLE "PaperExecution"
  ADD COLUMN "sourcePrice" DECIMAL(36,18),
  ADD COLUMN "slippageCost" DECIMAL(36,18) NOT NULL DEFAULT 0;

CREATE TABLE "RewardFundState" (
  "id" UUID NOT NULL, "mode" "RewardMode" NOT NULL, "aggregateSettlementNav" DECIMAL(36,18) NOT NULL DEFAULT 0,
  "highWaterMark" DECIMAL(36,18) NOT NULL DEFAULT 0, "lossCarryforward" DECIMAL(36,18) NOT NULL DEFAULT 0,
  "cumulativeNetRealized" DECIMAL(36,18) NOT NULL DEFAULT 0, "cumulativeDistributedProfit" DECIMAL(36,18) NOT NULL DEFAULT 0,
  "lastEpochNumber" INTEGER NOT NULL DEFAULT 0, "lastFinalizedEpochId" UUID, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RewardFundState_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RewardSettlementCursor" (
  "id" UUID NOT NULL, "mode" "RewardMode" NOT NULL DEFAULT 'PAPER', "strategyCode" VARCHAR(64) NOT NULL,
  "realizedPnl" DECIMAL(36,18) NOT NULL DEFAULT 0, "grossRealizedPnl" DECIMAL(36,18) NOT NULL DEFAULT 0,
  "fees" DECIMAL(36,18) NOT NULL DEFAULT 0, "fundingPnl" DECIMAL(36,18) NOT NULL DEFAULT 0,
  "slippageCost" DECIMAL(36,18) NOT NULL DEFAULT 0, "liquidationPenalty" DECIMAL(36,18) NOT NULL DEFAULT 0,
  "nav" DECIMAL(36,18) NOT NULL DEFAULT 0, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RewardSettlementCursor_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SettlementSourceSnapshot" (
  "id" UUID NOT NULL, "rewardEpochId" UUID NOT NULL, "strategyCode" VARCHAR(64) NOT NULL,
  "startNav" DECIMAL(36,18) NOT NULL, "endNav" DECIMAL(36,18) NOT NULL, "grossRealizedPnl" DECIMAL(36,18) NOT NULL,
  "tradingFees" DECIMAL(36,18) NOT NULL, "fundingPnl" DECIMAL(36,18) NOT NULL, "slippageCost" DECIMAL(36,18) NOT NULL,
  "liquidationPenalty" DECIMAL(36,18) NOT NULL, "netRealizedPnl" DECIMAL(36,18) NOT NULL, "frozenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cumulativeRealizedPnl" DECIMAL(36,18) NOT NULL, "cumulativeGrossRealizedPnl" DECIMAL(36,18) NOT NULL,
  "cumulativeFees" DECIMAL(36,18) NOT NULL, "cumulativeFundingPnl" DECIMAL(36,18) NOT NULL,
  "cumulativeSlippageCost" DECIMAL(36,18) NOT NULL, "cumulativeLiquidationPenalty" DECIMAL(36,18) NOT NULL,
  CONSTRAINT "SettlementSourceSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "UserRewardAllocation" (
  "id" UUID NOT NULL, "rewardEpochId" UUID NOT NULL, "userId" UUID NOT NULL,
  "principalXp" DECIMAL(36,18) NOT NULL, "dynamicXp" DECIMAL(36,18) NOT NULL, "totalXp" DECIMAL(36,18) NOT NULL,
  "globalTotalXp" DECIMAL(36,18) NOT NULL, "shareRatio" DECIMAL(36,18) NOT NULL, "grossReward" DECIMAL(36,18) NOT NULL,
  "feeRate" DECIMAL(18,8) NOT NULL, "withdrawalFee" DECIMAL(36,18) NOT NULL, "netReward" DECIMAL(36,18) NOT NULL,
  "status" "UserRewardStatus" NOT NULL DEFAULT 'PENDING', "mode" "RewardMode" NOT NULL DEFAULT 'PAPER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "availableAt" TIMESTAMP(3), "withdrawnAt" TIMESTAMP(3),
  CONSTRAINT "UserRewardAllocation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RewardAuditEvent" (
  "id" UUID NOT NULL, "rewardEpochId" UUID NOT NULL, "type" VARCHAR(64) NOT NULL, "actorId" UUID,
  "details" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RewardAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RewardEpoch_mode_number_key" ON "RewardEpoch"("mode", "number");
CREATE UNIQUE INDEX "RewardEpoch_mode_startsAt_key" ON "RewardEpoch"("mode", "startsAt");
CREATE INDEX "RewardEpoch_status_endsAt_idx" ON "RewardEpoch"("status", "endsAt");
CREATE UNIQUE INDEX "RewardFundState_mode_key" ON "RewardFundState"("mode");
CREATE UNIQUE INDEX "RewardFundState_lastFinalizedEpochId_key" ON "RewardFundState"("lastFinalizedEpochId");
CREATE UNIQUE INDEX "RewardSettlementCursor_mode_strategyCode_key" ON "RewardSettlementCursor"("mode", "strategyCode");
CREATE UNIQUE INDEX "SettlementSourceSnapshot_rewardEpochId_strategyCode_key" ON "SettlementSourceSnapshot"("rewardEpochId", "strategyCode");
CREATE UNIQUE INDEX "UserRewardAllocation_rewardEpochId_userId_key" ON "UserRewardAllocation"("rewardEpochId", "userId");
CREATE INDEX "UserRewardAllocation_userId_status_idx" ON "UserRewardAllocation"("userId", "status");
CREATE INDEX "RewardAuditEvent_rewardEpochId_createdAt_idx" ON "RewardAuditEvent"("rewardEpochId", "createdAt");
CREATE UNIQUE INDEX "RewardAuditEvent_rewardEpochId_type_key" ON "RewardAuditEvent"("rewardEpochId", "type");

ALTER TABLE "RewardEpoch" ADD CONSTRAINT "RewardEpoch_configVersion_fkey" FOREIGN KEY ("configVersion") REFERENCES "SystemConfigVersion"("version") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RewardFundState" ADD CONSTRAINT "RewardFundState_lastFinalizedEpochId_fkey" FOREIGN KEY ("lastFinalizedEpochId") REFERENCES "RewardEpoch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementSourceSnapshot" ADD CONSTRAINT "SettlementSourceSnapshot_rewardEpochId_fkey" FOREIGN KEY ("rewardEpochId") REFERENCES "RewardEpoch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserRewardAllocation" ADD CONSTRAINT "UserRewardAllocation_rewardEpochId_fkey" FOREIGN KEY ("rewardEpochId") REFERENCES "RewardEpoch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserRewardAllocation" ADD CONSTRAINT "UserRewardAllocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RewardAuditEvent" ADD CONSTRAINT "RewardAuditEvent_rewardEpochId_fkey" FOREIGN KEY ("rewardEpochId") REFERENCES "RewardEpoch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Finalized accounting inputs and allocations are immutable at the database boundary.
CREATE FUNCTION "reject_finalized_reward_epoch_mutation"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'FINALIZED' THEN
    RAISE EXCEPTION 'finalized reward epoch is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RewardEpoch_finalized_immutable"
BEFORE UPDATE OR DELETE ON "RewardEpoch"
FOR EACH ROW EXECUTE FUNCTION "reject_finalized_reward_epoch_mutation"();

CREATE FUNCTION "reject_finalized_reward_child_mutation"() RETURNS trigger AS $$
DECLARE target_epoch UUID;
BEGIN
  target_epoch := COALESCE(NEW."rewardEpochId", OLD."rewardEpochId");
  IF EXISTS (SELECT 1 FROM "RewardEpoch" WHERE "id" = target_epoch AND "status" = 'FINALIZED') THEN
    RAISE EXCEPTION 'finalized reward epoch child records are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SettlementSourceSnapshot_finalized_immutable"
BEFORE UPDATE OR DELETE ON "SettlementSourceSnapshot"
FOR EACH ROW EXECUTE FUNCTION "reject_finalized_reward_child_mutation"();
CREATE TRIGGER "UserRewardAllocation_finalized_immutable"
BEFORE UPDATE OR DELETE ON "UserRewardAllocation"
FOR EACH ROW EXECUTE FUNCTION "reject_finalized_reward_child_mutation"();
CREATE TRIGGER "XpSnapshot_finalized_immutable"
BEFORE UPDATE OR DELETE ON "XpSnapshot"
FOR EACH ROW EXECUTE FUNCTION "reject_finalized_reward_child_mutation"();
