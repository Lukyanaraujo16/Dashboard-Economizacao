import type { Prisma, PrismaClient } from '../../../generated/prisma/client.js';
import type { AuditAction } from '../domain/audit-actions.js';
import { sanitizeAuditMetadata } from '../domain/sanitize-audit-metadata.js';

export type AuditLogWrite = {
  readonly operatorUserId: string;
  readonly tenantId: string | null;
  readonly action: AuditAction;
  readonly targetType: string;
  readonly targetId: string | null;
  readonly result: 'SUCCESS' | 'FAILURE';
  readonly metadata?: Record<string, unknown> | null;
};

/**
 * Grava a trilha depois da mutação já confirmada pelo repositório.
 * Os repositórios administrativos commitam a própria transação; não dá para
 * reverter essa mutação daqui sem reescrever cada repositório. Por isso a
 * falha deste insert não desfaz a operação — ela propaga para a requisição,
 * e uma repetição precisa conviver com o estado já gravado (conflito ou
 * atualização idempotente). O payload é sanitizado para o insert não falhar
 * por conteúdo sensível.
 */
export async function recordAdministrativeAudit(
  prisma: PrismaClient,
  input: AuditLogWrite,
): Promise<void> {
  const metadata = sanitizeAuditMetadata(input.metadata ?? null);
  const data: Prisma.AuditLogCreateInput = {
    operator: { connect: { id: input.operatorUserId } },
    ...(input.tenantId ? { tenant: { connect: { id: input.tenantId } } } : {}),
    action: input.action,
    targetType: input.targetType,
    ...(input.targetId ? { targetId: input.targetId } : {}),
    result: input.result,
    ...(metadata ? { metadata } : {}),
  };
  await prisma.auditLog.create({ data });
}
