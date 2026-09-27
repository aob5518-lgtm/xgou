ALTER TABLE "ExecutionAuthorization"
  ADD COLUMN "maxPriceDeviationBps" DECIMAL(18,8) NOT NULL DEFAULT 100;

ALTER TABLE "ExchangeCredentialProfile" ADD COLUMN "expiresAt" TIMESTAMP(3);

ALTER TABLE "DryRunExecution"
  ADD COLUMN "riskDecisionId" UUID,
  ADD COLUMN "authorizationId" UUID,
  ADD COLUMN "networkSent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "fillCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "recoveryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "recoveredAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "DryRunExecution" AS dre
SET "riskDecisionId" = (
      SELECT ea."riskDecisionId" FROM "ExecutionAuthorization" AS ea
      WHERE ea."proposalId" = dre."proposalId" ORDER BY ea."createdAt" DESC LIMIT 1
    ),
    "authorizationId" = (
      SELECT ea."id" FROM "ExecutionAuthorization" AS ea
      WHERE ea."proposalId" = dre."proposalId" ORDER BY ea."createdAt" DESC LIMIT 1
    )
WHERE EXISTS (SELECT 1 FROM "ExecutionAuthorization" AS ea WHERE ea."proposalId" = dre."proposalId");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "DryRunExecution" WHERE "riskDecisionId" IS NULL OR "authorizationId" IS NULL) THEN
    RAISE EXCEPTION 'existing DryRunExecution rows require a persisted ExecutionAuthorization';
  END IF;
END $$;

ALTER TABLE "DryRunExecution"
  ALTER COLUMN "riskDecisionId" SET NOT NULL,
  ALTER COLUMN "authorizationId" SET NOT NULL;

CREATE INDEX "DryRunExecution_authorizationId_idx" ON "DryRunExecution"("authorizationId");

ALTER TABLE "ExecutionAuthorization"
  ADD CONSTRAINT "ExecutionAuthorization_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "TradeProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ExecutionAuthorization_riskDecisionId_fkey" FOREIGN KEY ("riskDecisionId") REFERENCES "RiskDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DryRunExecution"
  ADD CONSTRAINT "DryRunExecution_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "TradeProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DryRunExecution_riskDecisionId_fkey" FOREIGN KEY ("riskDecisionId") REFERENCES "RiskDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DryRunExecution_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "ExecutionAuthorization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "GlobalTradingControl" (
  "id" VARCHAR(32) NOT NULL,
  "state" "GlobalTradingState" NOT NULL DEFAULT 'ACTIVE',
  "reason" VARCHAR(512) NOT NULL,
  "manualResumeRequired" BOOLEAN NOT NULL DEFAULT false,
  "triggeredBy" VARCHAR(128),
  "triggeredAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "GlobalTradingControl_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GlobalTradingControl_singleton_check" CHECK ("id" = 'GLOBAL')
);

INSERT INTO "GlobalTradingControl" ("id", "state", "reason", "manualResumeRequired", "updatedAt", "version")
VALUES ('GLOBAL', 'ACTIVE', 'INITIALIZED', false, CURRENT_TIMESTAMP, 1);

CREATE TABLE "ProductionReadinessEvidence" (
  "id" UUID NOT NULL,
  "control" VARCHAR(128) NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "evidenceReference" VARCHAR(512) NOT NULL,
  "verifiedBy" VARCHAR(128) NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "environment" "ProductionEnvironment" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductionReadinessEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductionReadinessEvidence_status_check" CHECK ("status" IN ('PASS', 'WARN', 'FAIL'))
);

CREATE UNIQUE INDEX "ProductionReadinessEvidence_control_environment_key" ON "ProductionReadinessEvidence"("control", "environment");
CREATE INDEX "ProductionReadinessEvidence_environment_status_verifiedAt_idx" ON "ProductionReadinessEvidence"("environment", "status", "verifiedAt");
