-- CreateEnum
CREATE TYPE "integration_provider" AS ENUM ('CONTA_AZUL');

-- CreateEnum
CREATE TYPE "integration_status" AS ENUM ('DISCONNECTED', 'CONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "integrations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider" "integration_provider" NOT NULL,
    "status" "integration_status" NOT NULL,
    "connected_at" TIMESTAMPTZ(3),
    "disconnected_at" TIMESTAMPTZ(3),
    "last_error_at" TIMESTAMPTZ(3),
    "last_error_code" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_credentials" (
    "id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "encrypted_access_token" TEXT NOT NULL,
    "encrypted_refresh_token" TEXT NOT NULL,
    "access_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "token_type" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_integrations_tenant_provider" ON "integrations"("tenant_id", "provider");

-- CreateIndex
CREATE INDEX "idx_integrations_tenant_id" ON "integrations"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_integration_credentials_integration_id" ON "integration_credentials"("integration_id");

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_integration_id_fkey"
FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
