-- Phase 2B deposit lifecycle.
ALTER TYPE "DepositStatus" RENAME VALUE 'PENDING_CHAIN' TO 'AWAITING_TX';
ALTER TYPE "DepositStatus" RENAME VALUE 'CONFIRMED' TO 'CHAIN_CONFIRMED';
ALTER TYPE "DepositStatus" ADD VALUE 'AWAITING_APPROVAL' AFTER 'CREATED';
ALTER TYPE "DepositStatus" ADD VALUE 'TX_SUBMITTED' AFTER 'AWAITING_TX';
ALTER TYPE "DepositStatus" ADD VALUE 'REJECTED' AFTER 'FAILED';

CREATE TYPE "OnchainEventStatus" AS ENUM ('FINALIZED', 'PROCESSED', 'FAILED', 'REVIEW');
CREATE TYPE "ReconciliationStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');
CREATE TYPE "ReconciliationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "ContractVerificationStatus" AS ENUM ('NOT_VERIFIED', 'VERIFIED', 'FAILED');

CREATE TABLE "ChainAccount" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "chainId" VARCHAR(64) NOT NULL,
    "walletAddress" VARCHAR(42) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChainAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TokenRegistry" (
    "id" UUID NOT NULL,
    "chainId" VARCHAR(64) NOT NULL,
    "symbol" VARCHAR(12) NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "decimals" INTEGER NOT NULL,
    "isGasToken" BOOLEAN NOT NULL DEFAULT false,
    "isDepositAsset" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TokenRegistry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContractDeployment" (
    "id" UUID NOT NULL,
    "chainId" VARCHAR(64) NOT NULL,
    "contractName" VARCHAR(64) NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "version" VARCHAR(32) NOT NULL,
    "deploymentTxHash" VARCHAR(66) NOT NULL,
    "deploymentBlock" BIGINT NOT NULL,
    "verificationStatus" "ContractVerificationStatus" NOT NULL DEFAULT 'NOT_VERIFIED',
    "deployedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractDeployment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChainCursor" (
    "id" UUID NOT NULL,
    "chainId" VARCHAR(64) NOT NULL,
    "contractAddress" VARCHAR(42) NOT NULL,
    "eventName" VARCHAR(64) NOT NULL,
    "lastProcessedBlock" BIGINT NOT NULL,
    "lastBlockHash" VARCHAR(66),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChainCursor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OnchainEvent" (
    "id" UUID NOT NULL,
    "chainId" VARCHAR(64) NOT NULL,
    "contractAddress" VARCHAR(42) NOT NULL,
    "txHash" VARCHAR(66) NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" VARCHAR(66) NOT NULL,
    "eventName" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "finalizedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "status" "OnchainEventStatus" NOT NULL DEFAULT 'FINALIZED',
    "error" VARCHAR(512),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OnchainEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DepositChainReference" (
    "id" UUID NOT NULL,
    "depositId" UUID NOT NULL,
    "chainId" VARCHAR(64) NOT NULL,
    "clientReference" VARCHAR(66) NOT NULL,
    "walletAddress" VARCHAR(42) NOT NULL,
    "routerAddress" VARCHAR(42) NOT NULL,
    "assetAddress" VARCHAR(42) NOT NULL,
    "txHash" VARCHAR(66),
    "logIndex" INTEGER,
    "blockNumber" BIGINT,
    "blockHash" VARCHAR(66),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DepositChainReference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReconciliationDifference" (
    "id" UUID NOT NULL,
    "chainId" VARCHAR(64) NOT NULL,
    "fundDomain" "FundDomain" NOT NULL,
    "internalBalance" DECIMAL(36,18) NOT NULL,
    "externalBalance" DECIMAL(36,18) NOT NULL,
    "difference" DECIMAL(36,18) NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "ReconciliationSeverity" NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "ReconciliationDifference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChainAccount_chainId_walletAddress_key" ON "ChainAccount"("chainId", "walletAddress");
CREATE UNIQUE INDEX "ChainAccount_userId_chainId_key" ON "ChainAccount"("userId", "chainId");
CREATE INDEX "ChainAccount_userId_idx" ON "ChainAccount"("userId");
CREATE UNIQUE INDEX "TokenRegistry_chainId_address_key" ON "TokenRegistry"("chainId", "address");
CREATE INDEX "TokenRegistry_chainId_symbol_idx" ON "TokenRegistry"("chainId", "symbol");
CREATE UNIQUE INDEX "ContractDeployment_chainId_address_key" ON "ContractDeployment"("chainId", "address");
CREATE UNIQUE INDEX "ContractDeployment_chainId_contractName_version_key" ON "ContractDeployment"("chainId", "contractName", "version");
CREATE UNIQUE INDEX "ChainCursor_chainId_contractAddress_eventName_key" ON "ChainCursor"("chainId", "contractAddress", "eventName");
CREATE UNIQUE INDEX "OnchainEvent_chainId_txHash_logIndex_key" ON "OnchainEvent"("chainId", "txHash", "logIndex");
CREATE INDEX "OnchainEvent_chainId_contractAddress_blockNumber_idx" ON "OnchainEvent"("chainId", "contractAddress", "blockNumber");
CREATE INDEX "OnchainEvent_status_createdAt_idx" ON "OnchainEvent"("status", "createdAt");
CREATE UNIQUE INDEX "DepositChainReference_depositId_key" ON "DepositChainReference"("depositId");
CREATE UNIQUE INDEX "DepositChainReference_chainId_walletAddress_clientReference_key" ON "DepositChainReference"("chainId", "walletAddress", "clientReference");
CREATE UNIQUE INDEX "DepositChainReference_chainId_txHash_key" ON "DepositChainReference"("chainId", "txHash");
CREATE INDEX "DepositChainReference_clientReference_idx" ON "DepositChainReference"("clientReference");
CREATE INDEX "ReconciliationDifference_chainId_fundDomain_status_idx" ON "ReconciliationDifference"("chainId", "fundDomain", "status");
CREATE INDEX "ReconciliationDifference_severity_detectedAt_idx" ON "ReconciliationDifference"("severity", "detectedAt");

ALTER TABLE "ChainAccount" ADD CONSTRAINT "ChainAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DepositChainReference" ADD CONSTRAINT "DepositChainReference_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "Deposit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TokenRegistry"
  ADD CONSTRAINT "TokenRegistry_decimals_valid" CHECK ("decimals" BETWEEN 0 AND 255),
  ADD CONSTRAINT "TokenRegistry_address_format" CHECK ("address" ~ '^0x[a-fA-F0-9]{40}$');

ALTER TABLE "OnchainEvent"
  ADD CONSTRAINT "OnchainEvent_log_index_nonnegative" CHECK ("logIndex" >= 0),
  ADD CONSTRAINT "OnchainEvent_address_format" CHECK ("contractAddress" ~ '^0x[a-fA-F0-9]{40}$');
