-- CreateEnum
CREATE TYPE "stored_file_type" AS ENUM ('TENANT_LOGO');

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "file_type" "stored_file_type" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "tenant_branding" ADD COLUMN "logo_file_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "uq_files_storage_key" ON "files"("storage_key");

-- CreateIndex
CREATE INDEX "idx_files_tenant_id" ON "files"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_branding_logo_file_id_key" ON "tenant_branding"("logo_file_id");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_branding" ADD CONSTRAINT "tenant_branding_logo_file_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
