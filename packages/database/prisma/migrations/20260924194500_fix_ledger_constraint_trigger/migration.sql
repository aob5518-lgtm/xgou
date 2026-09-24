CREATE OR REPLACE FUNCTION assert_ledger_transaction_balanced() RETURNS trigger AS $$
DECLARE
  target_transaction UUID;
BEGIN
  IF TG_TABLE_NAME = 'LedgerTransaction' THEN
    target_transaction := NEW."id";
  ELSE
    target_transaction := NEW."transactionId";
  END IF;

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
