-- CreateTable
CREATE TABLE "cost_centers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "synced_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installment_cost_center_allocations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cost_center_id" UUID NOT NULL,
    "receivable_id" UUID,
    "payable_id" UUID,
    "amount" DECIMAL(19,4) NOT NULL,
    "synced_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "installment_cost_center_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_icca_exactly_one_installment" CHECK (("receivable_id" IS NULL) <> ("payable_id" IS NULL))
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_cost_centers_integration_external_id" ON "cost_centers"("integration_id", "external_id");

-- CreateIndex
CREATE INDEX "idx_cost_centers_tenant_active" ON "cost_centers"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "idx_cost_centers_tenant_name" ON "cost_centers"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "idx_icca_tenant_cost_center" ON "installment_cost_center_allocations"("tenant_id", "cost_center_id");

-- CreateIndex
CREATE INDEX "idx_icca_receivable" ON "installment_cost_center_allocations"("receivable_id");

-- CreateIndex
CREATE INDEX "idx_icca_payable" ON "installment_cost_center_allocations"("payable_id");

-- Partial unique: one allocation row per cost center × receivable
CREATE UNIQUE INDEX "uq_icca_cost_center_receivable"
ON "installment_cost_center_allocations"("cost_center_id", "receivable_id")
WHERE "receivable_id" IS NOT NULL;

-- Partial unique: one allocation row per cost center × payable
CREATE UNIQUE INDEX "uq_icca_cost_center_payable"
ON "installment_cost_center_allocations"("cost_center_id", "payable_id")
WHERE "payable_id" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_cost_center_allocations" ADD CONSTRAINT "installment_cost_center_allocations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_cost_center_allocations" ADD CONSTRAINT "installment_cost_center_allocations_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_cost_center_allocations" ADD CONSTRAINT "installment_cost_center_allocations_receivable_id_fkey" FOREIGN KEY ("receivable_id") REFERENCES "receivables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_cost_center_allocations" ADD CONSTRAINT "installment_cost_center_allocations_payable_id_fkey" FOREIGN KEY ("payable_id") REFERENCES "payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
