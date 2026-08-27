-- CASH-9C: transferências entre contas próprias (GET /v1/financeiro/transferencias).
-- Um objeto origem/destino. Não é RECEIPT/DISBURSEMENT.
-- Associação conservadora 1:1 com settlement ghost via financial_transfer_id.

DO $$ BEGIN
    CREATE TYPE "financial_transfer_match_status" AS ENUM ('UNMATCHED', 'MATCHED', 'AMBIGUOUS');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "financial_transfers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "occurred_on" DATE NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "source_financial_account_external_id" TEXT NOT NULL,
    "destination_financial_account_external_id" TEXT NOT NULL,
    "description" TEXT,
    "match_status" "financial_transfer_match_status" NOT NULL,
    "synced_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "financial_transfers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_financial_transfers_integration_external_id"
  ON "financial_transfers"("integration_id", "external_id");

CREATE INDEX IF NOT EXISTS "idx_financial_transfers_tenant_id"
  ON "financial_transfers"("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_financial_transfers_tenant_occurred_on"
  ON "financial_transfers"("tenant_id", "occurred_on");

CREATE INDEX IF NOT EXISTS "idx_financial_transfers_tenant_source_account"
  ON "financial_transfers"("tenant_id", "source_financial_account_external_id");

CREATE INDEX IF NOT EXISTS "idx_financial_transfers_tenant_destination_account"
  ON "financial_transfers"("tenant_id", "destination_financial_account_external_id");

DO $$ BEGIN
    ALTER TABLE "financial_transfers"
      ADD CONSTRAINT "financial_transfers_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "financial_transfers"
      ADD CONSTRAINT "financial_transfers_integration_id_fkey"
      FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "financial_transactions"
  ADD COLUMN IF NOT EXISTS "financial_transfer_id" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_financial_transactions_financial_transfer_id"
  ON "financial_transactions"("financial_transfer_id");

DO $$ BEGIN
    ALTER TABLE "financial_transactions"
      ADD CONSTRAINT "financial_transactions_financial_transfer_id_fkey"
      FOREIGN KEY ("financial_transfer_id") REFERENCES "financial_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
