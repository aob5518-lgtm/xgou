CREATE TABLE "EpochSettlementBaseline" (
  "id" UUID NOT NULL,
  "rewardEpochId" UUID NOT NULL,
  "strategyCode" VARCHAR(64) NOT NULL,
  "nav" DECIMAL(36,18) NOT NULL,
  "realizedPnl" DECIMAL(36,18) NOT NULL,
  "grossRealizedPnl" DECIMAL(36,18) NOT NULL,
  "fees" DECIMAL(36,18) NOT NULL,
  "fundingPnl" DECIMAL(36,18) NOT NULL,
  "slippageCost" DECIMAL(36,18) NOT NULL,
  "liquidationPenalty" DECIMAL(36,18) NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EpochSettlementBaseline_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EpochSettlementBaseline_rewardEpochId_strategyCode_key"
  ON "EpochSettlementBaseline"("rewardEpochId", "strategyCode");
CREATE INDEX "EpochSettlementBaseline_strategyCode_capturedAt_idx"
  ON "EpochSettlementBaseline"("strategyCode", "capturedAt");

ALTER TABLE "EpochSettlementBaseline"
  ADD CONSTRAINT "EpochSettlementBaseline_rewardEpochId_fkey"
  FOREIGN KEY ("rewardEpochId") REFERENCES "RewardEpoch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Epoch baselines are immutable accounting inputs, regardless of epoch status.
CREATE FUNCTION "reject_epoch_settlement_baseline_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'epoch settlement baseline is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "EpochSettlementBaseline_immutable"
BEFORE UPDATE OR DELETE ON "EpochSettlementBaseline"
FOR EACH ROW EXECUTE FUNCTION "reject_epoch_settlement_baseline_mutation"();
