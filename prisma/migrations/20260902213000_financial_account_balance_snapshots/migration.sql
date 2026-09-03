-- Correção 08-C1: snapshots diários de saldo oficial Conta Azul (saldo-atual).
CREATE TABLE "financial_account_balance_snapshots" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "financial_account_id" UUID NOT NULL,
    "financial_account_external_id" TEXT NOT NULL,
    "balance" DECIMAL(19,4) NOT NULL,
    "balance_date" DATE NOT NULL,
    "captured_at" TIMESTAMPTZ(3) NOT NULL,
    "account_active_at_capture" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "financial_account_balance_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_financial_account_balance_snapshots_account_date"
  ON "financial_account_balance_snapshots"("financial_account_id", "balance_date");

CREATE INDEX "idx_financial_account_balance_snapshots_tenant_date"
  ON "financial_account_balance_snapshots"("tenant_id", "balance_date");

CREATE INDEX "idx_financial_account_balance_snapshots_tenant_account_date"
  ON "financial_account_balance_snapshots"("tenant_id", "financial_account_id", "balance_date");

ALTER TABLE "financial_account_balance_snapshots"
  ADD CONSTRAINT "financial_account_balance_snapshots_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "financial_account_balance_snapshots"
  ADD CONSTRAINT "financial_account_balance_snapshots_integration_id_fkey"
  FOREIGN KEY ("integration_id") REFERENCES "integrations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "financial_account_balance_snapshots"
  ADD CONSTRAINT "financial_account_balance_snapshots_financial_account_id_fkey"
  FOREIGN KEY ("financial_account_id") REFERENCES "financial_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
