-- Correção 11-E.1: lifecycle de presença AR/AP + checkpoint bounded.
-- Default ACTIVE: registros existentes permanecem ACTIVE (sem tombstone na migration).

CREATE TYPE "installment_presence_lifecycle" AS ENUM ('ACTIVE', 'DELETED');

ALTER TABLE "receivables"
ADD COLUMN "lifecycle_status" "installment_presence_lifecycle" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "lifecycle_deleted_at" TIMESTAMPTZ(3);

ALTER TABLE "payables"
ADD COLUMN "lifecycle_status" "installment_presence_lifecycle" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "lifecycle_deleted_at" TIMESTAMPTZ(3);

CREATE INDEX "idx_receivables_tenant_lifecycle_status"
ON "receivables"("tenant_id", "lifecycle_status", "status");

CREATE INDEX "idx_receivables_tenant_lifecycle_due_date"
ON "receivables"("tenant_id", "lifecycle_status", "due_date");

CREATE INDEX "idx_payables_tenant_lifecycle_status"
ON "payables"("tenant_id", "lifecycle_status", "status");

CREATE INDEX "idx_payables_tenant_lifecycle_due_date"
ON "payables"("tenant_id", "lifecycle_status", "due_date");

CREATE TABLE "installment_presence_checkpoints" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "installment_kind" "financial_transaction_installment_kind" NOT NULL,
    "installment_external_id" TEXT NOT NULL,
    "last_presence_checked_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "installment_presence_checkpoints_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_ipc_integration_kind_installment"
ON "installment_presence_checkpoints"("integration_id", "installment_kind", "installment_external_id");

CREATE INDEX "idx_ipc_tenant_id"
ON "installment_presence_checkpoints"("tenant_id");

CREATE INDEX "idx_ipc_integration_checked_at"
ON "installment_presence_checkpoints"("integration_id", "last_presence_checked_at");

ALTER TABLE "installment_presence_checkpoints"
ADD CONSTRAINT "installment_presence_checkpoints_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "installment_presence_checkpoints"
ADD CONSTRAINT "installment_presence_checkpoints_integration_id_fkey"
FOREIGN KEY ("integration_id") REFERENCES "integrations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
