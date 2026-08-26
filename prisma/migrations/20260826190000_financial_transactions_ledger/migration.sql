-- CASH-2: uma linha por baixa Conta Azul. Sem FK para AR/AP.
-- gross_amount = quitação do título; net_amount = caixa (valor_liquido).
-- Idempotente: o banco de testes local pode já ter a tabela L1 (20260820040000)
-- que NÃO está no Git oficial.

DO $$ BEGIN
    CREATE TYPE "financial_transaction_type" AS ENUM ('RECEIPT', 'DISBURSEMENT');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "financial_transaction_lifecycle" AS ENUM ('ACTIVE', 'DELETED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "financial_transaction_installment_kind" AS ENUM ('RECEIVABLE', 'PAYABLE');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "financial_transactions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "installment_external_id" TEXT NOT NULL,
    "installment_kind" "financial_transaction_installment_kind" NOT NULL,
    "transaction_type" "financial_transaction_type" NOT NULL,
    "occurred_on" DATE NOT NULL,
    "gross_amount" DECIMAL(19,4) NOT NULL,
    "net_amount" DECIMAL(19,4) NOT NULL,
    "interest_amount" DECIMAL(19,4) NOT NULL,
    "fine_amount" DECIMAL(19,4) NOT NULL,
    "discount_amount" DECIMAL(19,4) NOT NULL,
    "fee_amount" DECIMAL(19,4) NOT NULL,
    "financial_account_external_id" TEXT,
    "payment_method" TEXT,
    "upstream_version" INTEGER,
    "upstream_updated_at" TIMESTAMPTZ(3),
    "lifecycle_status" "financial_transaction_lifecycle" NOT NULL,
    "synced_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_financial_transactions_integration_external_id"
  ON "financial_transactions"("integration_id", "external_id");

CREATE INDEX IF NOT EXISTS "idx_financial_transactions_tenant_id"
  ON "financial_transactions"("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_financial_transactions_tenant_occurred_on"
  ON "financial_transactions"("tenant_id", "occurred_on");

CREATE INDEX IF NOT EXISTS "idx_financial_transactions_tenant_installment"
  ON "financial_transactions"("tenant_id", "installment_external_id");

CREATE INDEX IF NOT EXISTS "idx_financial_transactions_tenant_type_occurred_on"
  ON "financial_transactions"("tenant_id", "transaction_type", "occurred_on");

DO $$ BEGIN
    ALTER TABLE "financial_transactions"
      ADD CONSTRAINT "financial_transactions_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "financial_transactions"
      ADD CONSTRAINT "financial_transactions_integration_id_fkey"
      FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
