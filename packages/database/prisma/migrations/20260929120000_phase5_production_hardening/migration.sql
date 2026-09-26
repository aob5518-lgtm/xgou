ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'TREASURY_OPERATOR';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SECURITY_ADMIN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'AUDITOR';

CREATE TYPE "ProductionEnvironment" AS ENUM ('DEVELOPMENT', 'TESTNET', 'PRODUCTION');
CREATE TYPE "PrincipalType" AS ENUM ('EOA_DEV', 'MULTISIG', 'MPC', 'HSM', 'KMS', 'CUSTODY', 'SERVICE_IDENTITY');
CREATE TYPE "PolicyStatus" AS ENUM ('ACTIVE', 'DISABLED', 'EXPIRED');
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'EXECUTED');
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVE', 'REJECT');
CREATE TYPE "ExecutionMode" AS ENUM ('PAPER', 'DRY_RUN', 'SANDBOX', 'LIVE');
CREATE TYPE "GlobalTradingState" AS ENUM ('ACTIVE', 'REDUCE_ONLY', 'PAUSED', 'EMERGENCY_STOP');
CREATE TYPE "ExecutionState" AS ENUM ('AUTHORIZED', 'SUBMITTING', 'SUBMITTED', 'ACKNOWLEDGED', 'PARTIALLY_FILLED', 'FILLED', 'CANCEL_REQUESTED', 'CANCELLED', 'REJECTED', 'UNKNOWN', 'RECONCILIATION_REQUIRED');
CREATE TYPE "IncidentSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL', 'EMERGENCY');
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'MITIGATING', 'RESOLVED', 'POSTMORTEM_REQUIRED');
CREATE TYPE "AllowlistStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED');
CREATE TYPE "SecurityEventType" AS ENUM ('INVALID_PRODUCTION_KEY_PROVIDER', 'WITHDRAW_PERMISSION_DETECTED', 'MAINNET_GATE_BYPASS_ATTEMPT', 'SECRET_IN_LOG_DETECTED', 'UNAUTHORIZED_TREASURY_ACTION');

CREATE TABLE "ExchangeCredentialProfile" ("id" UUID NOT NULL, "exchange" VARCHAR(64) NOT NULL, "accountId" VARCHAR(128) NOT NULL, "subaccountId" VARCHAR(128), "credentialReference" VARCHAR(512) NOT NULL, "permissions" TEXT[], "environment" "ProductionEnvironment" NOT NULL, "status" "PolicyStatus" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ExchangeCredentialProfile_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "ExchangeCredentialProfile_exchange_accountId_subaccountId_environ_key" ON "ExchangeCredentialProfile"("exchange", "accountId", "subaccountId", "environment");
CREATE INDEX "ExchangeCredentialProfile_environment_status_idx" ON "ExchangeCredentialProfile"("environment", "status");

CREATE TABLE "RolePolicy" ("id" UUID NOT NULL, "environment" "ProductionEnvironment" NOT NULL, "role" VARCHAR(64) NOT NULL, "principalType" "PrincipalType" NOT NULL, "principalReference" VARCHAR(512) NOT NULL, "requiredApprovals" INTEGER NOT NULL, "status" "PolicyStatus" NOT NULL DEFAULT 'ACTIVE', "effectiveAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "RolePolicy_pkey" PRIMARY KEY ("id"));
CREATE INDEX "RolePolicy_environment_role_status_idx" ON "RolePolicy"("environment", "role", "status");

CREATE TABLE "ApprovalRequest" ("id" UUID NOT NULL, "actionType" VARCHAR(128) NOT NULL, "resourceType" VARCHAR(128) NOT NULL, "resourceId" VARCHAR(256) NOT NULL, "requestedBy" VARCHAR(128) NOT NULL, "requiredApprovals" INTEGER NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id"));
CREATE INDEX "ApprovalRequest_status_expiresAt_idx" ON "ApprovalRequest"("status", "expiresAt");
CREATE TABLE "Approval" ("id" UUID NOT NULL, "approvalRequestId" UUID NOT NULL, "approverId" VARCHAR(128) NOT NULL, "decision" "ApprovalDecision" NOT NULL, "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Approval_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Approval_approvalRequestId_approverId_key" ON "Approval"("approvalRequestId", "approverId");
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ExecutionAuthorization" ("id" UUID NOT NULL, "proposalId" UUID NOT NULL, "riskDecisionId" UUID NOT NULL, "executionMode" "ExecutionMode" NOT NULL, "environment" "ProductionEnvironment" NOT NULL, "policyStatus" VARCHAR(32) NOT NULL, "riskStatus" VARCHAR(32) NOT NULL, "globalTradingState" "GlobalTradingState" NOT NULL, "authorizedBy" VARCHAR(128) NOT NULL, "referencePrice" DECIMAL(36,18) NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ExecutionAuthorization_pkey" PRIMARY KEY ("id"));
CREATE INDEX "ExecutionAuthorization_proposalId_expiresAt_idx" ON "ExecutionAuthorization"("proposalId", "expiresAt");

CREATE TABLE "DryRunExecution" ("id" UUID NOT NULL, "proposalId" UUID NOT NULL, "clientOrderId" VARCHAR(128) NOT NULL, "exchange" VARCHAR(64) NOT NULL, "symbol" VARCHAR(64) NOT NULL, "side" VARCHAR(32) NOT NULL, "type" VARCHAR(32) NOT NULL, "quantity" DECIMAL(36,18) NOT NULL, "price" DECIMAL(36,18), "reduceOnly" BOOLEAN NOT NULL, "timeInForce" VARCHAR(16) NOT NULL, "leverage" DECIMAL(18,8), "credentialProfileId" UUID, "policyDecision" JSONB NOT NULL, "riskDecision" JSONB NOT NULL, "state" "ExecutionState" NOT NULL DEFAULT 'ACKNOWLEDGED', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DryRunExecution_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "DryRunExecution_clientOrderId_key" ON "DryRunExecution"("clientOrderId");
CREATE INDEX "DryRunExecution_state_createdAt_idx" ON "DryRunExecution"("state", "createdAt");

CREATE TABLE "TreasuryTransferRequest" ("id" UUID NOT NULL, "source" VARCHAR(256) NOT NULL, "destination" VARCHAR(256) NOT NULL, "asset" VARCHAR(16) NOT NULL, "amount" DECIMAL(36,18) NOT NULL, "reason" VARCHAR(512) NOT NULL, "requestedBy" VARCHAR(128) NOT NULL, "policyDecision" JSONB NOT NULL, "approvalState" VARCHAR(32) NOT NULL, "executionState" "ExecutionState" NOT NULL DEFAULT 'AUTHORIZED', "txHash" VARCHAR(66), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TreasuryTransferRequest_pkey" PRIMARY KEY ("id"));
CREATE INDEX "TreasuryTransferRequest_approvalState_createdAt_idx" ON "TreasuryTransferRequest"("approvalState", "createdAt");

CREATE TABLE "AddressAllowlist" ("id" UUID NOT NULL, "chainId" VARCHAR(64) NOT NULL, "address" VARCHAR(128) NOT NULL, "label" VARCHAR(128) NOT NULL, "purpose" VARCHAR(256) NOT NULL, "status" "AllowlistStatus" NOT NULL DEFAULT 'PENDING', "approvedBy" VARCHAR(128), "effectiveAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AddressAllowlist_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "AddressAllowlist_chainId_address_key" ON "AddressAllowlist"("chainId", "address");
CREATE TABLE "ProtocolAllowlist" ("id" UUID NOT NULL, "chainId" VARCHAR(64) NOT NULL, "protocol" VARCHAR(128) NOT NULL, "contract" VARCHAR(128) NOT NULL, "purpose" VARCHAR(256) NOT NULL, "status" "AllowlistStatus" NOT NULL DEFAULT 'PENDING', "approvedBy" VARCHAR(128), "effectiveAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ProtocolAllowlist_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "ProtocolAllowlist_chainId_contract_key" ON "ProtocolAllowlist"("chainId", "contract");

CREATE TABLE "ExecutionLimitPolicy" ("id" UUID NOT NULL, "environment" "ProductionEnvironment" NOT NULL, "strategyId" UUID, "asset" VARCHAR(16), "perTradeLimit" DECIMAL(36,18) NOT NULL, "perAssetDailyLimit" DECIMAL(36,18) NOT NULL, "perStrategyDailyLimit" DECIMAL(36,18) NOT NULL, "perTreasuryDailyLimit" DECIMAL(36,18) NOT NULL, "globalDailyLimit" DECIMAL(36,18) NOT NULL, "maxOrdersPerMinute" INTEGER NOT NULL, "maxOrdersPerHour" INTEGER NOT NULL, "maxNotionalPerMinute" DECIMAL(36,18) NOT NULL, "maxNotionalPerHour" DECIMAL(36,18) NOT NULL, "status" "PolicyStatus" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ExecutionLimitPolicy_pkey" PRIMARY KEY ("id"));
CREATE INDEX "ExecutionLimitPolicy_environment_status_idx" ON "ExecutionLimitPolicy"("environment", "status");

CREATE TABLE "OperationalRiskSnapshot" ("id" UUID NOT NULL, "exchangeHealth" VARCHAR(32) NOT NULL, "marketDataHealth" VARCHAR(32) NOT NULL, "keyProviderHealth" VARCHAR(32) NOT NULL, "reconciliationHealth" VARCHAR(32) NOT NULL, "unknownOrders" INTEGER NOT NULL, "errorRate" DECIMAL(18,8) NOT NULL, "globalState" "GlobalTradingState" NOT NULL, "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "OperationalRiskSnapshot_pkey" PRIMARY KEY ("id"));
CREATE INDEX "OperationalRiskSnapshot_capturedAt_idx" ON "OperationalRiskSnapshot"("capturedAt");

CREATE TABLE "Incident" ("id" UUID NOT NULL, "severity" "IncidentSeverity" NOT NULL, "type" VARCHAR(128) NOT NULL, "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN', "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "acknowledgedAt" TIMESTAMP(3), "resolvedAt" TIMESTAMP(3), "owner" VARCHAR(128), "summary" VARCHAR(512) NOT NULL, "details" JSONB NOT NULL, "linkedRiskEvents" TEXT[], CONSTRAINT "Incident_pkey" PRIMARY KEY ("id"));
CREATE INDEX "Incident_status_severity_detectedAt_idx" ON "Incident"("status", "severity", "detectedAt");
CREATE TABLE "SecurityEvent" ("id" UUID NOT NULL, "type" "SecurityEventType" NOT NULL, "severity" "IncidentSeverity" NOT NULL, "details" JSONB NOT NULL, "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolvedAt" TIMESTAMP(3), CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id"));
CREATE INDEX "SecurityEvent_type_detectedAt_idx" ON "SecurityEvent"("type", "detectedAt");

CREATE TABLE "CredentialRotationPolicy" ("id" UUID NOT NULL, "credentialProfileId" UUID NOT NULL, "rotationInterval" INTEGER NOT NULL, "lastRotatedAt" TIMESTAMP(3), "expiresAt" TIMESTAMP(3), "status" "PolicyStatus" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "CredentialRotationPolicy_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "CredentialRotationPolicy_credentialProfileId_key" ON "CredentialRotationPolicy"("credentialProfileId");
