-- AlterEnum
ALTER TYPE "sync_run_trigger_type" ADD VALUE 'SCHEDULED';

-- CreateEnum
CREATE TYPE "integration_sync_cursor_resource" AS ENUM ('PEOPLE', 'RECEIVABLES', 'PAYABLES');

-- CreateTable
CREATE TABLE "integration_sync_cursors" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "resource" "integration_sync_cursor_resource" NOT NULL,
    "cursor_at" TIMESTAMPTZ(3) NOT NULL,
    "external_account_id" TEXT NOT NULL,
    "last_run_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "integration_sync_cursors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_integration_sync_cursors_integration_resource" ON "integration_sync_cursors"("integration_id", "resource");

-- CreateIndex
CREATE INDEX "idx_integration_sync_cursors_tenant_id" ON "integration_sync_cursors"("tenant_id");

-- AddForeignKey
ALTER TABLE "integration_sync_cursors" ADD CONSTRAINT "integration_sync_cursors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_sync_cursors" ADD CONSTRAINT "integration_sync_cursors_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_sync_cursors" ADD CONSTRAINT "integration_sync_cursors_last_run_id_fkey" FOREIGN KEY ("last_run_id") REFERENCES "sync_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
