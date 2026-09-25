-- CreateEnum
CREATE TYPE "ai_emoji_preference" AS ENUM (
  'NONE',
  'MODERATE',
  'FREE'
);

-- AlterTable
ALTER TABLE "ai_tenant_settings"
  ADD COLUMN "emoji_preference" "ai_emoji_preference" NOT NULL DEFAULT 'MODERATE';
