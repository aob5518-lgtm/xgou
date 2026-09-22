-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'OPERATOR', 'RISK_MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ParticipationStatus" AS ENUM ('PENDING', 'EFFECTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RiskFlagStatus" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "walletAddress" VARCHAR(42) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "deviceFingerprint" VARCHAR(128),
    "registrationIpHash" VARCHAR(64),
    "riskScore" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthNonce" (
    "id" UUID NOT NULL,
    "walletAddress" VARCHAR(42) NOT NULL,
    "nonceHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "rotatedFromId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralEdge" (
    "userId" UUID NOT NULL,
    "inviterUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralEdge_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ReferralClosure" (
    "ancestorId" UUID NOT NULL,
    "descendantId" UUID NOT NULL,
    "depth" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralClosure_pkey" PRIMARY KEY ("ancestorId","descendantId")
);

-- CreateTable
CREATE TABLE "Participation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "amount" DECIMAL(36,18) NOT NULL,
    "asset" VARCHAR(12) NOT NULL,
    "status" "ParticipationStatus" NOT NULL DEFAULT 'PENDING',
    "externalRef" VARCHAR(128) NOT NULL,
    "effectiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Participation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrincipalXpEntry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "amount" DECIMAL(36,18) NOT NULL,
    "participationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrincipalXpEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardEpoch" (
    "id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardEpoch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XpSnapshot" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "rewardEpochId" UUID NOT NULL,
    "principalXp" DECIMAL(36,18) NOT NULL,
    "dynamicXp" DECIMAL(36,18) NOT NULL,
    "totalXp" DECIMAL(36,18) NOT NULL,
    "directReferralCount" INTEGER NOT NULL,
    "unlockedDepth" INTEGER NOT NULL,
    "networkPrincipalXp" DECIMAL(36,18) NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfigVersion" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "values" JSONB NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "createdBy" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemConfigVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskFlag" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "reason" VARCHAR(128) NOT NULL,
    "evidence" JSONB NOT NULL,
    "score" DECIMAL(8,4) NOT NULL,
    "status" "RiskFlagStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" VARCHAR(128) NOT NULL,
    "target" VARCHAR(256) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipHash" VARCHAR(64),
    "requestId" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "AuthNonce_nonceHash_key" ON "AuthNonce"("nonceHash");

-- CreateIndex
CREATE INDEX "AuthNonce_walletAddress_expiresAt_idx" ON "AuthNonce"("walletAddress", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_tokenHash_key" ON "RefreshSession"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshSession_userId_expiresAt_idx" ON "RefreshSession"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "ReferralEdge_inviterUserId_idx" ON "ReferralEdge"("inviterUserId");

-- CreateIndex
CREATE INDEX "ReferralEdge_createdAt_idx" ON "ReferralEdge"("createdAt");

-- CreateIndex
CREATE INDEX "ReferralClosure_ancestorId_depth_idx" ON "ReferralClosure"("ancestorId", "depth");

-- CreateIndex
CREATE INDEX "ReferralClosure_descendantId_depth_idx" ON "ReferralClosure"("descendantId", "depth");

-- CreateIndex
CREATE UNIQUE INDEX "Participation_externalRef_key" ON "Participation"("externalRef");

-- CreateIndex
CREATE INDEX "Participation_userId_status_idx" ON "Participation"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PrincipalXpEntry_participationId_key" ON "PrincipalXpEntry"("participationId");

-- CreateIndex
CREATE INDEX "PrincipalXpEntry_userId_createdAt_idx" ON "PrincipalXpEntry"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RewardEpoch_number_key" ON "RewardEpoch"("number");

-- CreateIndex
CREATE INDEX "XpSnapshot_rewardEpochId_idx" ON "XpSnapshot"("rewardEpochId");

-- CreateIndex
CREATE UNIQUE INDEX "XpSnapshot_userId_rewardEpochId_key" ON "XpSnapshot"("userId", "rewardEpochId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfigVersion_version_key" ON "SystemConfigVersion"("version");

-- CreateIndex
CREATE INDEX "SystemConfigVersion_effectiveAt_idx" ON "SystemConfigVersion"("effectiveAt");

-- CreateIndex
CREATE INDEX "RiskFlag_userId_status_idx" ON "RiskFlag"("userId", "status");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralEdge" ADD CONSTRAINT "ReferralEdge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralEdge" ADD CONSTRAINT "ReferralEdge_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralClosure" ADD CONSTRAINT "ReferralClosure_ancestorId_fkey" FOREIGN KEY ("ancestorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralClosure" ADD CONSTRAINT "ReferralClosure_descendantId_fkey" FOREIGN KEY ("descendantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participation" ADD CONSTRAINT "Participation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrincipalXpEntry" ADD CONSTRAINT "PrincipalXpEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrincipalXpEntry" ADD CONSTRAINT "PrincipalXpEntry_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "Participation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpSnapshot" ADD CONSTRAINT "XpSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpSnapshot" ADD CONSTRAINT "XpSnapshot_rewardEpochId_fkey" FOREIGN KEY ("rewardEpochId") REFERENCES "RewardEpoch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskFlag" ADD CONSTRAINT "RiskFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain invariants that Prisma cannot express directly.
ALTER TABLE "ReferralClosure"
  ADD CONSTRAINT "ReferralClosure_depth_check" CHECK ("depth" >= 0 AND "depth" <= 100);

ALTER TABLE "ReferralClosure"
  ADD CONSTRAINT "ReferralClosure_self_depth_check"
  CHECK (("ancestorId" = "descendantId" AND "depth" = 0) OR ("ancestorId" <> "descendantId" AND "depth" > 0));

ALTER TABLE "Participation"
  ADD CONSTRAINT "Participation_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "PrincipalXpEntry"
  ADD CONSTRAINT "PrincipalXpEntry_amount_nonnegative" CHECK ("amount" >= 0);

CREATE FUNCTION prevent_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_prevent_update_delete"
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
