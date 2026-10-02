import type { FastifyRequest } from 'fastify';

import type { PrismaClient } from '../../../generated/prisma/client.js';
import { UnauthenticatedError } from '../../../shared/errors/application-error.js';
import type { AuditAction } from '../domain/audit-actions.js';
import { recordAdministrativeAudit } from '../repositories/audit-log.repository.js';

export type AdminAuditSuccessInput = {
  readonly action: AuditAction;
  readonly tenantId: string | null;
  readonly targetType: string;
  readonly targetId: string | null;
  readonly metadata?: Record<string, unknown> | null;
};

export function createAdminAuditRecorder(prisma: PrismaClient) {
  return async function recordAdminAuditSuccess(
    request: FastifyRequest,
    input: AdminAuditSuccessInput,
  ): Promise<void> {
    const operatorUserId = request.auth?.userId;
    if (!operatorUserId) {
      throw new UnauthenticatedError();
    }
    await recordAdministrativeAudit(prisma, {
      operatorUserId,
      result: 'SUCCESS',
      action: input.action,
      tenantId: input.tenantId,
      targetType: input.targetType,
      targetId: input.targetId,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    });
  };
}
