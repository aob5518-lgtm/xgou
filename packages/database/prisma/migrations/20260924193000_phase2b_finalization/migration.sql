CREATE TYPE "ReconciliationRunStatus" AS ENUM ('RUNNING', 'PASSED', 'FAILED');

ALTER TABLE "Deposit" ADD COLUMN "configVersion" INTEGER;

CREATE TABLE "ReconciliationRun" (
    "id" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "ReconciliationRunStatus" NOT NULL DEFAULT 'RUNNING',
    "chainId" VARCHAR(64) NOT NULL,
    "bullInternal" DECIMAL(36,18),
    "bullExternal" DECIMAL(36,18),
    "spotInternal" DECIMAL(36,18),
    "spotExternal" DECIMAL(36,18),
    "futuresInternal" DECIMAL(36,18),
    "futuresExternal" DECIMAL(36,18),
    "criticalCount" INTEGER NOT NULL DEFAULT 0,
    "error" VARCHAR(1024),
    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ReconciliationDifference" ADD COLUMN "runId" UUID;

CREATE INDEX "Deposit_configVersion_idx" ON "Deposit"("configVersion");
CREATE INDEX "ReconciliationRun_chainId_startedAt_idx" ON "ReconciliationRun"("chainId", "startedAt");
CREATE INDEX "ReconciliationRun_status_startedAt_idx" ON "ReconciliationRun"("status", "startedAt");
CREATE INDEX "ReconciliationDifference_runId_idx" ON "ReconciliationDifference"("runId");

ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_configVersion_fkey"
  FOREIGN KEY ("configVersion") REFERENCES "SystemConfigVersion"("version") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReconciliationDifference" ADD CONSTRAINT "ReconciliationDifference_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "ReconciliationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
