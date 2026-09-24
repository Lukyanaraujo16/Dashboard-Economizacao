-- CreateEnum
CREATE TYPE "ai_tone_preset" AS ENUM (
  'PROFISSIONAL_OBJETIVO',
  'CONSULTIVO',
  'DIDATICO',
  'AMIGAVEL',
  'EXECUTIVO',
  'PERSONALIZADO'
);

-- CreateTable
CREATE TABLE "ai_platform_credentials" (
    "id" UUID NOT NULL,
    "provider" "ai_provider" NOT NULL,
    "encrypted_secret" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_platform_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_ai_platform_credentials_provider" ON "ai_platform_credentials"("provider");

-- AlterTable
ALTER TABLE "ai_tenant_settings"
  ADD COLUMN "consultant_name" TEXT,
  ADD COLUMN "tone_preset" "ai_tone_preset" NOT NULL DEFAULT 'PROFISSIONAL_OBJETIVO';
