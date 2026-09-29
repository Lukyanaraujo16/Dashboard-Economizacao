import type { FileStorage } from '../../../infrastructure/storage/file-storage.js';
import { NotFoundError } from '../../../shared/errors/application-error.js';
import type { TenantRepository } from '../../tenant/repositories/tenant.repository.js';
import { AdvisorDomainError } from '../domain/advisor-domain-error.js';
import { chunkAdvisorKnowledgeDocumentText } from '../domain/advisor-knowledge-document-chunking.js';
import { extractAdvisorKnowledgeDocumentText } from '../domain/advisor-knowledge-document-extract.js';
import {
  ADVISOR_KNOWLEDGE_DOCUMENT_TITLE_MAX,
} from '../domain/advisor-knowledge-document-limits.js';
import {
  createAdvisorKnowledgeDocumentStorageKey,
  validateAdvisorKnowledgeDocumentUpload,
} from '../domain/advisor-knowledge-document-validation.js';
import type { AiKnowledgeStatus } from '../domain/types.js';
import type { AdvisorKnowledgeDocumentRepository } from '../repositories/advisor-knowledge-document.repository.js';
import type { PublicKnowledgeDocument } from '../http/public-dtos.js';
import { toPublicKnowledgeDocument } from '../http/to-public-admin-consultant.js';
import { withAdvisorDomainError } from './map-advisor-http-error.js';

function mapProcessingErrorCode(error: unknown): string {
  if (error instanceof AdvisorDomainError) {
    return error.code;
  }
  return 'KNOWLEDGE_DOCUMENT_PROCESSING_FAILED';
}

async function bestEffortDelete(storage: FileStorage, storageKey: string): Promise<void> {
  try {
    await storage.delete(storageKey);
  } catch {
    // cleanup best-effort
  }
}

export type AdminConsultantKnowledgeDocumentService = {
  listDocuments(tenantId: string): Promise<readonly PublicKnowledgeDocument[]>;
  getDocument(tenantId: string, documentId: string): Promise<PublicKnowledgeDocument>;
  uploadDocument(
    tenantId: string,
    input: {
      readonly body: Buffer;
      readonly originalFileName: string;
      readonly declaredMimeType?: string;
      readonly title?: string;
      readonly createdById: string;
      readonly status?: AiKnowledgeStatus;
    },
  ): Promise<PublicKnowledgeDocument>;
  updateDocument(
    tenantId: string,
    documentId: string,
    input: { readonly title?: string; readonly status?: AiKnowledgeStatus },
  ): Promise<PublicKnowledgeDocument>;
  deleteDocument(tenantId: string, documentId: string): Promise<void>;
};

export function createAdminConsultantKnowledgeDocumentService(deps: {
  readonly tenants: TenantRepository;
  readonly documents: AdvisorKnowledgeDocumentRepository;
  readonly storage: FileStorage;
}): AdminConsultantKnowledgeDocumentService {
  async function requireTenant(tenantId: string): Promise<void> {
    const tenant = await deps.tenants.findById(tenantId);
    if (!tenant) {
      throw new NotFoundError('Empresa não encontrada.');
    }
  }

  return {
    async listDocuments(tenantId) {
      await requireTenant(tenantId);
      return withAdvisorDomainError(async () => {
        const rows = await deps.documents.listDocuments(tenantId);
        return rows.map(toPublicKnowledgeDocument);
      });
    },

    async getDocument(tenantId, documentId) {
      await requireTenant(tenantId);
      return withAdvisorDomainError(async () => {
        const row = await deps.documents.findDocumentById(tenantId, documentId);
        if (row === null) {
          throw new NotFoundError('Documento de conhecimento não encontrado neste tenant.');
        }
        return toPublicKnowledgeDocument(row);
      });
    },

    async uploadDocument(tenantId, input) {
      await requireTenant(tenantId);
      return withAdvisorDomainError(async () => {
        const validated = validateAdvisorKnowledgeDocumentUpload({
          body: input.body,
          originalFileName: input.originalFileName,
          declaredMimeType: input.declaredMimeType,
        });

        const title =
          input.title !== undefined && input.title.trim().length > 0
            ? input.title.trim().slice(0, ADVISOR_KNOWLEDGE_DOCUMENT_TITLE_MAX)
            : validated.title;

        const storageKey = createAdvisorKnowledgeDocumentStorageKey({
          tenantId,
          extension: validated.extension,
        });

        await deps.storage.put(storageKey, input.body);

        let document = await deps.documents.createDocument(tenantId, {
          title,
          originalFileName: validated.originalFileName,
          mimeType: validated.mimeType,
          sizeBytes: validated.sizeBytes,
          checksum: validated.checksum,
          storageKey,
          processingStatus: 'UPLOADED',
          status: input.status ?? 'DISABLED',
          createdById: input.createdById,
        });

        document = await deps.documents.updateDocument(tenantId, document.id, {
          processingStatus: 'PROCESSING',
        });

        try {
          const extracted = await extractAdvisorKnowledgeDocumentText({
            body: input.body,
            kind: validated.kind,
          });
          const chunks = chunkAdvisorKnowledgeDocumentText({
            text: extracted.text,
            kind: validated.kind,
          });
          if (chunks.length === 0) {
            throw new AdvisorDomainError(
              'KNOWLEDGE_DOCUMENT_EMPTY_TEXT',
              'Nenhum texto útil foi extraído do arquivo.',
            );
          }

          await deps.documents.replaceChunks(
            tenantId,
            document.id,
            chunks.map((chunk) => ({
              documentId: document.id,
              tenantId,
              ordinal: chunk.ordinal,
              heading: chunk.heading,
              content: chunk.content,
              charCount: chunk.charCount,
            })),
          );

          document = await deps.documents.updateDocument(tenantId, document.id, {
            processingStatus: 'READY',
            chunkCount: chunks.length,
            extractedCharCount: extracted.charCount,
            processingErrorCode: null,
            processedAt: new Date(),
          });
        } catch (error) {
          document = await deps.documents.updateDocument(tenantId, document.id, {
            processingStatus: 'FAILED',
            chunkCount: 0,
            extractedCharCount: 0,
            processingErrorCode: mapProcessingErrorCode(error),
            processedAt: new Date(),
          });
          await deps.documents.replaceChunks(tenantId, document.id, []);
        }

        return toPublicKnowledgeDocument(document);
      });
    },

    async updateDocument(tenantId, documentId, input) {
      await requireTenant(tenantId);
      return withAdvisorDomainError(async () => {
        const existing = await deps.documents.findDocumentById(tenantId, documentId);
        if (existing === null) {
          throw new NotFoundError('Documento de conhecimento não encontrado neste tenant.');
        }
        if (input.title === undefined && input.status === undefined) {
          throw new AdvisorDomainError(
            'KNOWLEDGE_DOCUMENT_UPDATE_EMPTY',
            'Informe ao menos um campo para atualizar.',
          );
        }
        if (input.status === 'ACTIVE' && existing.processingStatus !== 'READY') {
          throw new AdvisorDomainError(
            'KNOWLEDGE_DOCUMENT_NOT_READY',
            'Somente documentos prontos podem ser ativados.',
          );
        }
        const updated = await deps.documents.updateDocument(tenantId, documentId, {
          ...(input.title !== undefined
            ? { title: input.title.trim().slice(0, ADVISOR_KNOWLEDGE_DOCUMENT_TITLE_MAX) }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        });
        return toPublicKnowledgeDocument(updated);
      });
    },

    async deleteDocument(tenantId, documentId) {
      await requireTenant(tenantId);
      return withAdvisorDomainError(async () => {
        const deleted = await deps.documents.deleteDocument(tenantId, documentId);
        await bestEffortDelete(deps.storage, deleted.storageKey);
      });
    },
  };
}
