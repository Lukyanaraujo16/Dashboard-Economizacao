-- CreateEnum
CREATE TYPE "financial_category_type" AS ENUM ('REVENUE', 'EXPENSE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "party_profile" AS ENUM ('CUSTOMER', 'SUPPLIER', 'CARRIER');

-- CreateEnum
CREATE TYPE "financial_installment_status" AS ENUM ('OPEN', 'OVERDUE', 'PAID', 'PARTIALLY_PAID', 'LOST', 'RENEGOTIATED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "sync_run_trigger_type" AS ENUM ('MANUAL');

-- CreateEnum
CREATE TYPE "sync_run_status" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "financial_categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "financial_category_type" NOT NULL,
    "parent_external_id" TEXT,
    "upstream_version" INTEGER,
    "synced_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "financial_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "synced_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parties" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "active" BOOLEAN NOT NULL,
    "profiles" "party_profile"[] NOT NULL,
    "synced_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receivables" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "description" TEXT,
    "due_date" DATE NOT NULL,
    "competence_date" DATE,
    "upstream_created_at" TIMESTAMPTZ(3),
    "upstream_updated_at" TIMESTAMPTZ(3),
    "status" "financial_installment_status" NOT NULL,
    "upstream_status" TEXT,
    "total" DECIMAL(19,4) NOT NULL,
    "paid" DECIMAL(19,4) NOT NULL,
    "unpaid" DECIMAL(19,4) NOT NULL,
    "external_customer_id" TEXT,
    "party_id" UUID,
    "category_external_ids" TEXT[] NOT NULL,
    "synced_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "receivables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payables" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "description" TEXT,
    "due_date" DATE NOT NULL,
    "competence_date" DATE,
    "upstream_created_at" TIMESTAMPTZ(3),
    "upstream_updated_at" TIMESTAMPTZ(3),
    "status" "financial_installment_status" NOT NULL,
    "upstream_status" TEXT,
    "total" DECIMAL(19,4) NOT NULL,
    "paid" DECIMAL(19,4) NOT NULL,
    "unpaid" DECIMAL(19,4) NOT NULL,
    "external_supplier_id" TEXT,
    "party_id" UUID,
    "category_external_ids" TEXT[] NOT NULL,
    "synced_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "trigger_type" "sync_run_trigger_type" NOT NULL,
    "status" "sync_run_status" NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "finished_at" TIMESTAMPTZ(3),
    "heartbeat_at" TIMESTAMPTZ(3),
    "error_code" TEXT,
    "counts" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_financial_categories_integration_external_id" ON "financial_categories"("integration_id", "external_id");

-- CreateIndex
CREATE INDEX "idx_financial_categories_tenant_id" ON "financial_categories"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_financial_categories_tenant_type" ON "financial_categories"("tenant_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "uq_financial_accounts_integration_external_id" ON "financial_accounts"("integration_id", "external_id");

-- CreateIndex
CREATE INDEX "idx_financial_accounts_tenant_id" ON "financial_accounts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_parties_integration_external_id" ON "parties"("integration_id", "external_id");

-- CreateIndex
CREATE INDEX "idx_parties_tenant_id" ON "parties"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_receivables_integration_external_id" ON "receivables"("integration_id", "external_id");

-- CreateIndex
CREATE INDEX "idx_receivables_tenant_id" ON "receivables"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_receivables_tenant_due_date" ON "receivables"("tenant_id", "due_date");

-- CreateIndex
CREATE INDEX "idx_receivables_tenant_status" ON "receivables"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_payables_integration_external_id" ON "payables"("integration_id", "external_id");

-- CreateIndex
CREATE INDEX "idx_payables_tenant_id" ON "payables"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_payables_tenant_due_date" ON "payables"("tenant_id", "due_date");

-- CreateIndex
CREATE INDEX "idx_payables_tenant_status" ON "payables"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "idx_sync_runs_tenant_id" ON "sync_runs"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_sync_runs_integration_started_at" ON "sync_runs"("integration_id", "started_at");

-- Lock: uma sync ativa (PENDING ou RUNNING) por Integration.
CREATE UNIQUE INDEX "uq_sync_runs_integration_active" ON "sync_runs"("integration_id") WHERE status IN ('PENDING', 'RUNNING');

-- AddForeignKey
ALTER TABLE "financial_categories" ADD CONSTRAINT "financial_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_categories" ADD CONSTRAINT "financial_categories_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
