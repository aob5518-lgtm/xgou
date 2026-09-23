-- CreateEnum
CREATE TYPE "FundDomain" AS ENUM ('BULL', 'SPOT', 'FUTURES', 'REWARD', 'WITHDRAWAL', 'ECOSYSTEM', 'PLATFORM');

-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('DEPOSIT_CLEARING', 'USER_PRINCIPAL', 'BULL_VAULT', 'SPOT_TREASURY', 'SPOT_STRATEGY', 'FUTURES_TREASURY', 'FUTURES_STRATEGY', 'REWARD_VAULT', 'REWARD_PAYABLE', 'WITHDRAWAL_BUFFER', 'ECOSYSTEM_FUND', 'PLATFORM_TREASURY', 'FEE_EXPENSE', 'TRADING_PNL', 'FUNDING_EXPENSE');

-- CreateEnum
CREATE TYPE "LedgerSide" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "LedgerTransactionKind" AS ENUM ('DEPOSIT_CONFIRMATION', 'FUND_ALLOCATION', 'TREASURY_REBALANCE', 'MANUAL_ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('CREATED', 'PENDING_CHAIN', 'CONFIRMED', 'ALLOCATING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "FundAllocationStatus" AS ENUM ('PENDING', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "VaultKind" AS ENUM ('BULL_MASTER', 'SPOT_STRATEGY', 'FUTURES_STRATEGY', 'REWARD', 'ECOSYSTEM');

-- CreateEnum
CREATE TYPE "TreasuryAccountKind" AS ENUM ('DEPOSIT_CLEARING', 'SPOT_STRATEGY', 'FUTURES_STRATEGY', 'WITHDRAWAL_BUFFER', 'PLATFORM_OPERATING');

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" UUID NOT NULL,
    "code" VARCHAR(128) NOT NULL,
    "type" "LedgerAccountType" NOT NULL,
    "fundDomain" "FundDomain",
    "ownerUserId" UUID,
    "asset" VARCHAR(12) NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" UUID NOT NULL,
    "kind" "LedgerTransactionKind" NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "referenceType" VARCHAR(64) NOT NULL,
    "referenceId" VARCHAR(128) NOT NULL,
    "description" VARCHAR(512) NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "side" "LedgerSide" NOT NULL,
    "amount" DECIMAL(36,18) NOT NULL,
    "asset" VARCHAR(12) NOT NULL,
    "fundDomain" "FundDomain",
    "memo" VARCHAR(256),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "asset" VARCHAR(12) NOT NULL,
    "amount" DECIMAL(36,18) NOT NULL,
    "chainId" VARCHAR(64) NOT NULL,
    "tokenDecimals" INTEGER NOT NULL,
    "externalRef" VARCHAR(160) NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'CREATED',
    "confirmedAt" TIMESTAMP(3),
    "allocatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundAllocation" (
    "id" UUID NOT NULL,
    "depositId" UUID NOT NULL,
    "fundDomain" "FundDomain" NOT NULL,
    "amount" DECIMAL(36,18) NOT NULL,
    "ratio" DECIMAL(36,18) NOT NULL,
    "configVersion" INTEGER NOT NULL,
    "status" "FundAllocationStatus" NOT NULL DEFAULT 'PENDING',
    "ledgerReference" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" TIMESTAMP(3),

    CONSTRAINT "FundAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vault" (
    "id" UUID NOT NULL,
    "code" VARCHAR(128) NOT NULL,
    "kind" "VaultKind" NOT NULL,
    "fundDomain" "FundDomain" NOT NULL,
    "asset" VARCHAR(12) NOT NULL,
    "ledgerAccountId" UUID NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreasuryAccount" (
    "id" UUID NOT NULL,
    "code" VARCHAR(128) NOT NULL,
    "kind" "TreasuryAccountKind" NOT NULL,
    "fundDomain" "FundDomain",
    "asset" VARCHAR(12) NOT NULL,
    "ledgerAccountId" UUID NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreasuryAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_code_key" ON "LedgerAccount"("code");

-- CreateIndex
CREATE INDEX "LedgerAccount_type_asset_idx" ON "LedgerAccount"("type", "asset");

-- CreateIndex
CREATE INDEX "LedgerAccount_fundDomain_status_idx" ON "LedgerAccount"("fundDomain", "status");

-- CreateIndex
CREATE INDEX "LedgerAccount_ownerUserId_type_idx" ON "LedgerAccount"("ownerUserId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_idempotencyKey_key" ON "LedgerTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LedgerTransaction_referenceType_referenceId_idx" ON "LedgerTransaction"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "LedgerTransaction_effectiveAt_idx" ON "LedgerTransaction"("effectiveAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_accountId_createdAt_idx" ON "LedgerEntry"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_transactionId_idx" ON "LedgerEntry"("transactionId");

-- CreateIndex
CREATE INDEX "LedgerEntry_fundDomain_asset_idx" ON "LedgerEntry"("fundDomain", "asset");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_externalRef_key" ON "Deposit"("externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_idempotencyKey_key" ON "Deposit"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Deposit_userId_status_idx" ON "Deposit"("userId", "status");

-- CreateIndex
CREATE INDEX "Deposit_status_createdAt_idx" ON "Deposit"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FundAllocation_fundDomain_status_idx" ON "FundAllocation"("fundDomain", "status");

-- CreateIndex
CREATE INDEX "FundAllocation_configVersion_idx" ON "FundAllocation"("configVersion");

-- CreateIndex
CREATE UNIQUE INDEX "FundAllocation_depositId_fundDomain_key" ON "FundAllocation"("depositId", "fundDomain");

-- CreateIndex
CREATE UNIQUE INDEX "Vault_code_key" ON "Vault"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Vault_ledgerAccountId_key" ON "Vault"("ledgerAccountId");

-- CreateIndex
CREATE INDEX "Vault_fundDomain_status_idx" ON "Vault"("fundDomain", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryAccount_code_key" ON "TreasuryAccount"("code");

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryAccount_ledgerAccountId_key" ON "TreasuryAccount"("ledgerAccountId");

-- CreateIndex
CREATE INDEX "TreasuryAccount_fundDomain_status_idx" ON "TreasuryAccount"("fundDomain", "status");

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundAllocation" ADD CONSTRAINT "FundAllocation_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "Deposit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundAllocation" ADD CONSTRAINT "FundAllocation_configVersion_fkey" FOREIGN KEY ("configVersion") REFERENCES "SystemConfigVersion"("version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vault" ADD CONSTRAINT "Vault_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryAccount" ADD CONSTRAINT "TreasuryAccount_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Financial invariants that are deliberately enforced below the application layer.
ALTER TABLE "Deposit"
  ADD CONSTRAINT "Deposit_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "Deposit_token_decimals_valid" CHECK ("tokenDecimals" BETWEEN 0 AND 255),
  ADD CONSTRAINT "Deposit_asset_format" CHECK ("asset" ~ '^[A-Z0-9]{2,12}$');

ALTER TABLE "LedgerEntry"
  ADD CONSTRAINT "LedgerEntry_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "LedgerEntry_asset_format" CHECK ("asset" ~ '^[A-Z0-9]{2,12}$');

ALTER TABLE "FundAllocation"
  ADD CONSTRAINT "FundAllocation_amount_nonnegative" CHECK ("amount" >= 0),
  ADD CONSTRAINT "FundAllocation_ratio_valid" CHECK ("ratio" > 0 AND "ratio" <= 1),
  ADD CONSTRAINT "FundAllocation_investment_domain" CHECK ("fundDomain" IN ('BULL', 'SPOT', 'FUTURES'));

ALTER TABLE "LedgerAccount"
  ADD CONSTRAINT "LedgerAccount_asset_format" CHECK ("asset" ~ '^[A-Z0-9]{2,12}$'),
  ADD CONSTRAINT "LedgerAccount_fund_domain_boundary" CHECK (
    ("type" = 'BULL_VAULT' AND "fundDomain" = 'BULL') OR
    ("type" IN ('SPOT_TREASURY', 'SPOT_STRATEGY') AND "fundDomain" = 'SPOT') OR
    ("type" IN ('FUTURES_TREASURY', 'FUTURES_STRATEGY') AND "fundDomain" = 'FUTURES') OR
    ("type" IN ('REWARD_VAULT', 'REWARD_PAYABLE') AND "fundDomain" = 'REWARD') OR
    ("type" = 'WITHDRAWAL_BUFFER' AND "fundDomain" = 'WITHDRAWAL') OR
    ("type" = 'ECOSYSTEM_FUND' AND "fundDomain" = 'ECOSYSTEM') OR
    ("type" = 'PLATFORM_TREASURY' AND "fundDomain" = 'PLATFORM') OR
    ("type" IN ('DEPOSIT_CLEARING', 'USER_PRINCIPAL', 'FEE_EXPENSE', 'TRADING_PNL', 'FUNDING_EXPENSE') AND "fundDomain" IS NULL)
  );

ALTER TABLE "Vault"
  ADD CONSTRAINT "Vault_domain_boundary" CHECK (
    ("kind" = 'BULL_MASTER' AND "fundDomain" = 'BULL') OR
    ("kind" = 'SPOT_STRATEGY' AND "fundDomain" = 'SPOT') OR
    ("kind" = 'FUTURES_STRATEGY' AND "fundDomain" = 'FUTURES') OR
    ("kind" = 'REWARD' AND "fundDomain" = 'REWARD') OR
    ("kind" = 'ECOSYSTEM' AND "fundDomain" = 'ECOSYSTEM')
  );

ALTER TABLE "TreasuryAccount"
  ADD CONSTRAINT "TreasuryAccount_domain_boundary" CHECK (
    ("kind" = 'DEPOSIT_CLEARING' AND "fundDomain" IS NULL) OR
    ("kind" = 'SPOT_STRATEGY' AND "fundDomain" = 'SPOT') OR
    ("kind" = 'FUTURES_STRATEGY' AND "fundDomain" = 'FUTURES') OR
    ("kind" = 'WITHDRAWAL_BUFFER' AND "fundDomain" = 'WITHDRAWAL') OR
    ("kind" = 'PLATFORM_OPERATING' AND "fundDomain" = 'PLATFORM')
  );

CREATE FUNCTION assert_ledger_transaction_balanced() RETURNS trigger AS $$
DECLARE
  target_transaction UUID;
BEGIN
  target_transaction := CASE WHEN TG_TABLE_NAME = 'LedgerTransaction' THEN NEW."id" ELSE NEW."transactionId" END;

  IF NOT EXISTS (SELECT 1 FROM "LedgerEntry" WHERE "transactionId" = target_transaction) THEN
    RAISE EXCEPTION 'Ledger transaction % has no entries', target_transaction;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "LedgerEntry"
    WHERE "transactionId" = target_transaction
    GROUP BY "asset"
    HAVING SUM(CASE WHEN "side" = 'DEBIT' THEN "amount" ELSE -"amount" END) <> 0
  ) THEN
    RAISE EXCEPTION 'Ledger transaction % is not balanced by asset', target_transaction;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "LedgerEntry" entry
    JOIN "LedgerAccount" account ON account."id" = entry."accountId"
    WHERE entry."transactionId" = target_transaction
      AND (entry."asset" <> account."asset" OR entry."fundDomain" IS DISTINCT FROM account."fundDomain")
  ) THEN
    RAISE EXCEPTION 'Ledger transaction % crosses an account asset or fund-domain boundary', target_transaction;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "LedgerTransaction_balance_check"
AFTER INSERT ON "LedgerTransaction"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_ledger_transaction_balanced();

CREATE CONSTRAINT TRIGGER "LedgerEntry_balance_check"
AFTER INSERT ON "LedgerEntry"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_ledger_transaction_balanced();

CREATE FUNCTION prevent_posted_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Posted ledger records are immutable; create a reversal transaction';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "LedgerTransaction_immutable"
BEFORE UPDATE OR DELETE ON "LedgerTransaction"
FOR EACH ROW EXECUTE FUNCTION prevent_posted_ledger_mutation();

CREATE TRIGGER "LedgerEntry_immutable"
BEFORE UPDATE OR DELETE ON "LedgerEntry"
FOR EACH ROW EXECUTE FUNCTION prevent_posted_ledger_mutation();

CREATE FUNCTION prevent_ledger_account_identity_mutation() RETURNS trigger AS $$
BEGIN
  IF NEW."code" IS DISTINCT FROM OLD."code"
    OR NEW."type" IS DISTINCT FROM OLD."type"
    OR NEW."fundDomain" IS DISTINCT FROM OLD."fundDomain"
    OR NEW."ownerUserId" IS DISTINCT FROM OLD."ownerUserId"
    OR NEW."asset" IS DISTINCT FROM OLD."asset" THEN
    RAISE EXCEPTION 'Ledger account identity and fund boundary are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "LedgerAccount_identity_immutable"
BEFORE UPDATE ON "LedgerAccount"
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_account_identity_mutation();
