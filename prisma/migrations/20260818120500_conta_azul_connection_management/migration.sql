-- AlterTable
ALTER TABLE "integrations" ADD COLUMN "last_successful_sync_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "integration_external_accounts" (
    "id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "external_account_id" TEXT NOT NULL,
    "external_company_name" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "integration_external_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_integration_external_accounts_integration_id" ON "integration_external_accounts"("integration_id");

-- CreateIndex
CREATE INDEX "idx_integration_external_accounts_external_account_id" ON "integration_external_accounts"("external_account_id");

-- AddForeignKey
ALTER TABLE "integration_external_accounts" ADD CONSTRAINT "integration_external_accounts_integration_id_fkey"
FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
