-- Correção 10-F: checkpoint persistente de probe de lifecycle por installment.
-- NULL inicial implícito: ausência de row = neverChecked (discovery prioriza NULLS FIRST).

CREATE TABLE "financial_installment_lifecycle_checkpoints" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "installment_kind" "financial_transaction_installment_kind" NOT NULL,
    "installment_external_id" TEXT NOT NULL,
    "last_lifecycle_checked_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "financial_installment_lifecycle_checkpoints_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_filc_integration_kind_installment"
ON "financial_installment_lifecycle_checkpoints"("integration_id", "installment_kind", "installment_external_id");

CREATE INDEX "idx_filc_tenant_id"
ON "financial_installment_lifecycle_checkpoints"("tenant_id");

CREATE INDEX "idx_filc_integration_checked_at"
ON "financial_installment_lifecycle_checkpoints"("integration_id", "last_lifecycle_checked_at");

ALTER TABLE "financial_installment_lifecycle_checkpoints"
ADD CONSTRAINT "financial_installment_lifecycle_checkpoints_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "financial_installment_lifecycle_checkpoints"
ADD CONSTRAINT "financial_installment_lifecycle_checkpoints_integration_id_fkey"
FOREIGN KEY ("integration_id") REFERENCES "integrations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
