-- CreateEnum
CREATE TYPE "ai_knowledge_document_processing_status" AS ENUM ('UPLOADED', 'PROCESSING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "ai_knowledge_documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "original_file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "processing_status" "ai_knowledge_document_processing_status" NOT NULL,
    "status" "ai_knowledge_status" NOT NULL DEFAULT 'DISABLED',
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "extracted_char_count" INTEGER NOT NULL DEFAULT 0,
    "processing_error_code" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "ai_knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_knowledge_document_chunks" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "heading" TEXT,
    "content" TEXT NOT NULL,
    "char_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_knowledge_document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_ai_knowledge_documents_storage_key" ON "ai_knowledge_documents"("storage_key");

-- CreateIndex
CREATE INDEX "idx_ai_knowledge_documents_tenant_id" ON "ai_knowledge_documents"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_ai_knowledge_documents_tenant_status" ON "ai_knowledge_documents"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "idx_ai_knowledge_documents_tenant_processing" ON "ai_knowledge_documents"("tenant_id", "processing_status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_ai_knowledge_document_chunks_document_ordinal" ON "ai_knowledge_document_chunks"("document_id", "ordinal");

-- CreateIndex
CREATE INDEX "idx_ai_knowledge_document_chunks_tenant_id" ON "ai_knowledge_document_chunks"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_ai_knowledge_document_chunks_document_id" ON "ai_knowledge_document_chunks"("document_id");

-- AddForeignKey
ALTER TABLE "ai_knowledge_documents" ADD CONSTRAINT "ai_knowledge_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_knowledge_documents" ADD CONSTRAINT "ai_knowledge_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_knowledge_document_chunks" ADD CONSTRAINT "ai_knowledge_document_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "ai_knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_knowledge_document_chunks" ADD CONSTRAINT "ai_knowledge_document_chunks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
