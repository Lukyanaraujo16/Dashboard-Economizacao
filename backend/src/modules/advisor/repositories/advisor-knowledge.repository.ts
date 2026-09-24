import type { PrismaClient } from '../../../generated/prisma/client.js';
import { AdvisorDomainError } from '../domain/advisor-domain-error.js';
import type {
  AiKnowledgeEntryRecord,
  AiKnowledgeStatus,
  CreateAiKnowledgeEntryInput,
  UpdateAiKnowledgeEntryInput,
} from '../domain/types.js';
import { AI_KNOWLEDGE_STATUSES } from '../domain/types.js';
import { assertAdvisorTenantId } from './assert-tenant-id.js';

function assertKnowledgeStatus(status: string): asserts status is AiKnowledgeStatus {
  if (!(AI_KNOWLEDGE_STATUSES as readonly string[]).includes(status)) {
    throw new AdvisorDomainError(
      'AI_KNOWLEDGE_STATUS_INVALID',
      'Status do conhecimento deve ser ACTIVE ou DISABLED.',
    );
  }
}

function requireText(value: string, code: string, message: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AdvisorDomainError(code, message);
  }
  return trimmed;
}

function toRecord(row: {
  id: string;
  tenantId: string;
  title: string;
  content: string;
  contentType: AiKnowledgeEntryRecord['contentType'];
  status: AiKnowledgeStatus;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}): AiKnowledgeEntryRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    title: row.title,
    content: row.content,
    contentType: row.contentType,
    status: row.status,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type AdvisorKnowledgeRepository = {
  listKnowledge(tenantId: string): Promise<readonly AiKnowledgeEntryRecord[]>;
  findKnowledgeById(tenantId: string, entryId: string): Promise<AiKnowledgeEntryRecord | null>;
  createKnowledge(tenantId: string, input: CreateAiKnowledgeEntryInput): Promise<AiKnowledgeEntryRecord>;
  updateKnowledge(
    tenantId: string,
    entryId: string,
    input: UpdateAiKnowledgeEntryInput,
  ): Promise<AiKnowledgeEntryRecord>;
  deleteKnowledge(tenantId: string, entryId: string): Promise<void>;
};

export function createAdvisorKnowledgeRepository(prisma: PrismaClient): AdvisorKnowledgeRepository {
  return {
    async listKnowledge(tenantId) {
      assertAdvisorTenantId(tenantId);
      const rows = await prisma.aiKnowledgeEntry.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toRecord);
    },

    async findKnowledgeById(tenantId, entryId) {
      assertAdvisorTenantId(tenantId);
      const row = await prisma.aiKnowledgeEntry.findFirst({
        where: { id: entryId, tenantId },
      });
      return row === null ? null : toRecord(row);
    },

    async createKnowledge(tenantId, input) {
      assertAdvisorTenantId(tenantId);
      const title = requireText(input.title, 'KNOWLEDGE_TITLE_REQUIRED', 'Título do conhecimento é obrigatório.');
      const content = requireText(
        input.content,
        'KNOWLEDGE_CONTENT_REQUIRED',
        'Conteúdo do conhecimento é obrigatório.',
      );
      const status = input.status ?? 'DISABLED';
      assertKnowledgeStatus(status);

      const author = await prisma.user.findUnique({
        where: { id: input.createdById },
        select: { id: true, tenantId: true },
      });
      if (author === null) {
        throw new AdvisorDomainError('KNOWLEDGE_AUTHOR_NOT_FOUND', 'Usuário autor do conhecimento não existe.');
      }
      if (author.tenantId !== null && author.tenantId !== tenantId) {
        throw new AdvisorDomainError(
          'USER_NOT_IN_TENANT',
          'Autor do conhecimento não pertence ao tenant.',
        );
      }

      const row = await prisma.aiKnowledgeEntry.create({
        data: {
          tenantId,
          title,
          content,
          contentType: 'TEXT',
          status,
          createdById: input.createdById,
        },
      });
      return toRecord(row);
    },

    async updateKnowledge(tenantId, entryId, input) {
      assertAdvisorTenantId(tenantId);
      const existing = await prisma.aiKnowledgeEntry.findFirst({
        where: { id: entryId, tenantId },
        select: { id: true },
      });
      if (existing === null) {
        throw new AdvisorDomainError(
          'KNOWLEDGE_NOT_FOUND',
          'Entrada de conhecimento não encontrada neste tenant.',
        );
      }

      const data: {
        title?: string;
        content?: string;
        status?: AiKnowledgeStatus;
      } = {};
      if (input.title !== undefined) {
        data.title = requireText(input.title, 'KNOWLEDGE_TITLE_REQUIRED', 'Título do conhecimento é obrigatório.');
      }
      if (input.content !== undefined) {
        data.content = requireText(
          input.content,
          'KNOWLEDGE_CONTENT_REQUIRED',
          'Conteúdo do conhecimento é obrigatório.',
        );
      }
      if (input.status !== undefined) {
        assertKnowledgeStatus(input.status);
        data.status = input.status;
      }

      const row = await prisma.aiKnowledgeEntry.update({
        where: { id: existing.id },
        data,
      });
      return toRecord(row);
    },

    async deleteKnowledge(tenantId, entryId) {
      assertAdvisorTenantId(tenantId);
      const existing = await prisma.aiKnowledgeEntry.findFirst({
        where: { id: entryId, tenantId },
        select: { id: true },
      });
      if (existing === null) {
        throw new AdvisorDomainError(
          'KNOWLEDGE_NOT_FOUND',
          'Entrada de conhecimento não encontrada neste tenant.',
        );
      }
      await prisma.aiKnowledgeEntry.delete({ where: { id: existing.id } });
    },
  };
}
