import type { PrismaClient } from '../../../generated/prisma/client.js';
import { AdvisorDomainError } from '../domain/advisor-domain-error.js';
import { ADVISOR_DOCUMENT_KNOWLEDGE_MAX_CANDIDATE_CHUNKS } from '../domain/advisor-document-knowledge-limits.js';
import type { AdvisorDocumentKnowledgeCandidate } from '../domain/retrieve-advisor-document-knowledge.js';
import type {
  AiKnowledgeDocumentProcessingStatus,
  AiKnowledgeDocumentRecord,
  AiKnowledgeStatus,
  CreateAiKnowledgeDocumentChunkInput,
  CreateAiKnowledgeDocumentInput,
  UpdateAiKnowledgeDocumentInput,
} from '../domain/types.js';
import { AI_KNOWLEDGE_DOCUMENT_PROCESSING_STATUSES, AI_KNOWLEDGE_STATUSES } from '../domain/types.js';
import { assertAdvisorTenantId } from './assert-tenant-id.js';

function assertProcessingStatus(
  status: string,
): asserts status is AiKnowledgeDocumentProcessingStatus {
  if (!(AI_KNOWLEDGE_DOCUMENT_PROCESSING_STATUSES as readonly string[]).includes(status)) {
    throw new AdvisorDomainError(
      'AI_KNOWLEDGE_DOCUMENT_PROCESSING_STATUS_INVALID',
      'Status de processamento do documento inválido.',
    );
  }
}

function assertKnowledgeStatus(status: string): asserts status is AiKnowledgeStatus {
  if (!(AI_KNOWLEDGE_STATUSES as readonly string[]).includes(status)) {
    throw new AdvisorDomainError(
      'AI_KNOWLEDGE_STATUS_INVALID',
      'Status do conhecimento deve ser ACTIVE ou DISABLED.',
    );
  }
}

function toDocumentRecord(row: {
  id: string;
  tenantId: string;
  title: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  storageKey: string;
  processingStatus: AiKnowledgeDocumentProcessingStatus;
  status: AiKnowledgeStatus;
  chunkCount: number;
  extractedCharCount: number;
  processingErrorCode: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  processedAt: Date | null;
}): AiKnowledgeDocumentRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    title: row.title,
    originalFileName: row.originalFileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    checksum: row.checksum,
    storageKey: row.storageKey,
    processingStatus: row.processingStatus,
    status: row.status,
    chunkCount: row.chunkCount,
    extractedCharCount: row.extractedCharCount,
    processingErrorCode: row.processingErrorCode,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    processedAt: row.processedAt,
  };
}

export type AdvisorKnowledgeDocumentRepository = {
  listDocuments(tenantId: string): Promise<readonly AiKnowledgeDocumentRecord[]>;
  findDocumentById(tenantId: string, documentId: string): Promise<AiKnowledgeDocumentRecord | null>;
  /**
   * Chunks de documentos ACTIVE+READY do tenant, ordenados de forma estável.
   * Limite hard em ADVISOR_DOCUMENT_KNOWLEDGE_MAX_CANDIDATE_CHUNKS (scoring em memória).
   */
  listActiveReadyChunksForRetrieval(
    tenantId: string,
  ): Promise<readonly AdvisorDocumentKnowledgeCandidate[]>;
  createDocument(
    tenantId: string,
    input: CreateAiKnowledgeDocumentInput,
  ): Promise<AiKnowledgeDocumentRecord>;
  updateDocument(
    tenantId: string,
    documentId: string,
    input: UpdateAiKnowledgeDocumentInput,
  ): Promise<AiKnowledgeDocumentRecord>;
  replaceChunks(
    tenantId: string,
    documentId: string,
    chunks: readonly CreateAiKnowledgeDocumentChunkInput[],
  ): Promise<void>;
  deleteDocument(tenantId: string, documentId: string): Promise<AiKnowledgeDocumentRecord>;
};

export function createAdvisorKnowledgeDocumentRepository(
  prisma: PrismaClient,
): AdvisorKnowledgeDocumentRepository {
  return {
    async listDocuments(tenantId) {
      assertAdvisorTenantId(tenantId);
      const rows = await prisma.aiKnowledgeDocument.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toDocumentRecord);
    },

    async findDocumentById(tenantId, documentId) {
      assertAdvisorTenantId(tenantId);
      const row = await prisma.aiKnowledgeDocument.findFirst({
        where: { id: documentId, tenantId },
      });
      return row === null ? null : toDocumentRecord(row);
    },

    async listActiveReadyChunksForRetrieval(tenantId) {
      assertAdvisorTenantId(tenantId);
      const rows = await prisma.aiKnowledgeDocumentChunk.findMany({
        where: {
          tenantId,
          document: {
            tenantId,
            status: 'ACTIVE',
            processingStatus: 'READY',
          },
        },
        select: {
          id: true,
          documentId: true,
          ordinal: true,
          heading: true,
          content: true,
          charCount: true,
          document: {
            select: {
              title: true,
            },
          },
        },
        orderBy: [{ documentId: 'asc' }, { ordinal: 'asc' }],
        take: ADVISOR_DOCUMENT_KNOWLEDGE_MAX_CANDIDATE_CHUNKS,
      });
      return rows.map((row) => ({
        chunkId: row.id,
        documentId: row.documentId,
        documentTitle: row.document.title,
        ordinal: row.ordinal,
        heading: row.heading,
        content: row.content,
        charCount: row.charCount,
      }));
    },

    async createDocument(tenantId, input) {
      assertAdvisorTenantId(tenantId);
      assertProcessingStatus(input.processingStatus);
      const status = input.status ?? 'DISABLED';
      assertKnowledgeStatus(status);

      const author = await prisma.user.findUnique({
        where: { id: input.createdById },
        select: { id: true, tenantId: true },
      });
      if (author === null) {
        throw new AdvisorDomainError(
          'KNOWLEDGE_AUTHOR_NOT_FOUND',
          'Uuário autor do conhecimento não existe.',
        );
      }
      if (author.tenantId !== null && author.tenantId !== tenantId) {
        throw new AdvisorDomainError(
          'USER_NOT_IN_TENANT',
          'Autor do conhecimento não pertence ao tenant.',
        );
      }

      const row = await prisma.aiKnowledgeDocument.create({
        data: {
          tenantId,
          title: input.title.trim(),
          originalFileName: input.originalFileName,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          checksum: input.checksum,
          storageKey: input.storageKey,
          processingStatus: input.processingStatus,
          status,
          createdById: input.createdById,
        },
      });
      return toDocumentRecord(row);
    },

    async updateDocument(tenantId, documentId, input) {
      assertAdvisorTenantId(tenantId);
      const existing = await prisma.aiKnowledgeDocument.findFirst({
        where: { id: documentId, tenantId },
        select: { id: true },
      });
      if (existing === null) {
        throw new AdvisorDomainError(
          'KNOWLEDGE_DOCUMENT_NOT_FOUND',
          'Documento de conhecimento não encontrado neste tenant.',
        );
      }

      const data: {
        title?: string;
        status?: AiKnowledgeStatus;
        processingStatus?: AiKnowledgeDocumentProcessingStatus;
        chunkCount?: number;
        extractedCharCount?: number;
        processingErrorCode?: string | null;
        processedAt?: Date | null;
      } = {};
      if (input.title !== undefined) {
        const title = input.title.trim();
        if (title.length === 0) {
          throw new AdvisorDomainError(
            'KNOWLEDGE_TITLE_REQUIRED',
            'Título do documento é obrigatório.',
          );
        }
        data.title = title;
      }
      if (input.status !== undefined) {
        assertKnowledgeStatus(input.status);
        data.status = input.status;
      }
      if (input.processingStatus !== undefined) {
        assertProcessingStatus(input.processingStatus);
        data.processingStatus = input.processingStatus;
      }
      if (input.chunkCount !== undefined) {
        data.chunkCount = input.chunkCount;
      }
      if (input.extractedCharCount !== undefined) {
        data.extractedCharCount = input.extractedCharCount;
      }
      if (input.processingErrorCode !== undefined) {
        data.processingErrorCode = input.processingErrorCode;
      }
      if (input.processedAt !== undefined) {
        data.processedAt = input.processedAt;
      }

      const row = await prisma.aiKnowledgeDocument.update({
        where: { id: existing.id },
        data,
      });
      return toDocumentRecord(row);
    },

    async replaceChunks(tenantId, documentId, chunks) {
      assertAdvisorTenantId(tenantId);
      const existing = await prisma.aiKnowledgeDocument.findFirst({
        where: { id: documentId, tenantId },
        select: { id: true },
      });
      if (existing === null) {
        throw new AdvisorDomainError(
          'KNOWLEDGE_DOCUMENT_NOT_FOUND',
          'Documento de conhecimento não encontrado neste tenant.',
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.aiKnowledgeDocumentChunk.deleteMany({ where: { documentId: existing.id } });
        if (chunks.length === 0) {
          return;
        }
        await tx.aiKnowledgeDocumentChunk.createMany({
          data: chunks.map((chunk) => ({
            documentId: existing.id,
            tenantId,
            ordinal: chunk.ordinal,
            heading: chunk.heading,
            content: chunk.content,
            charCount: chunk.charCount,
          })),
        });
      });
    },

    async deleteDocument(tenantId, documentId) {
      assertAdvisorTenantId(tenantId);
      const existing = await prisma.aiKnowledgeDocument.findFirst({
        where: { id: documentId, tenantId },
      });
      if (existing === null) {
        throw new AdvisorDomainError(
          'KNOWLEDGE_DOCUMENT_NOT_FOUND',
          'Documento de conhecimento não encontrado neste tenant.',
        );
      }
      // Cascades remove chunks.
      await prisma.aiKnowledgeDocument.delete({ where: { id: existing.id } });
      return toDocumentRecord(existing);
    },
  };
}
