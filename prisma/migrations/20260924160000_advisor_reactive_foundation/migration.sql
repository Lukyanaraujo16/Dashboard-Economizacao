-- F13.1: fundação persistente do Consultor Financeiro.
-- Sem backfill de settings: tenant existente permanece sem Consultor configurado.

-- CreateEnum
CREATE TYPE "ai_provider" AS ENUM ('OPENAI', 'ANTHROPIC');

-- CreateEnum
CREATE TYPE "ai_consultant_status" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ai_knowledge_content_type" AS ENUM ('TEXT');

-- CreateEnum
CREATE TYPE "ai_knowledge_status" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ai_conversation_status" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ai_message_sender_type" AS ENUM ('USER', 'CONSULTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ai_message_type" AS ENUM ('TEXT');

-- CreateEnum
CREATE TYPE "ai_run_type" AS ENUM ('QUESTION_REPLY');

-- CreateEnum
CREATE TYPE "ai_run_status" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED', 'TIMEOUT', 'LIMIT_BLOCKED');

-- CreateEnum
CREATE TYPE "ai_run_error_code" AS ENUM ('AUTH', 'RATE_LIMIT', 'TIMEOUT', 'MODEL_UNAVAILABLE', 'BAD_REQUEST', 'CONTENT_REJECTED', 'PROVIDER_ERROR', 'UNKNOWN');

-- CreateTable
CREATE TABLE "ai_tenant_settings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider" "ai_provider" NOT NULL,
    "model" TEXT NOT NULL,
    "business_segment" TEXT,
    "business_description" TEXT,
    "admin_prompt" TEXT,
    "tone" TEXT,
    "status" "ai_consultant_status" NOT NULL DEFAULT 'DISABLED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_tenant_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_knowledge_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "content_type" "ai_knowledge_content_type" NOT NULL DEFAULT 'TEXT',
    "status" "ai_knowledge_status" NOT NULL DEFAULT 'DISABLED',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_knowledge_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "ai_conversation_status" NOT NULL DEFAULT 'OPEN',
    "title" TEXT,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "last_message_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sender_type" "ai_message_sender_type" NOT NULL,
    "content" TEXT NOT NULL,
    "message_type" "ai_message_type" NOT NULL DEFAULT 'TEXT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_runs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "conversation_id" UUID,
    "message_id" UUID,
    "run_type" "ai_run_type" NOT NULL DEFAULT 'QUESTION_REPLY',
    "provider" "ai_provider" NOT NULL,
    "model" TEXT NOT NULL,
    "status" "ai_run_status" NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "duration_ms" INTEGER,
    "error_code" "ai_run_error_code",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_ai_tenant_settings_tenant_id" ON "ai_tenant_settings"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_ai_knowledge_entries_tenant_id" ON "ai_knowledge_entries"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_ai_conversations_tenant_id" ON "ai_conversations"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_ai_conversations_tenant_user" ON "ai_conversations"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_ai_conversations_tenant_last_message_at" ON "ai_conversations"("tenant_id", "last_message_at");

-- CreateIndex
CREATE INDEX "idx_ai_messages_tenant_id" ON "ai_messages"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_ai_messages_conversation_created_at" ON "ai_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_ai_runs_tenant_created_at" ON "ai_runs"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_tenant_settings" ADD CONSTRAINT "ai_tenant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_knowledge_entries" ADD CONSTRAINT "ai_knowledge_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_knowledge_entries" ADD CONSTRAINT "ai_knowledge_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "ai_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
