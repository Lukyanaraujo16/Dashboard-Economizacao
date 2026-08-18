import type { FastifyRequest } from 'fastify';

import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/application-error.js';
import type { TenantRepository } from '../../tenant/repositories/tenant.repository.js';
import type { AuthenticatedRequestContext } from '../domain/authentication-context.js';
import type { ActiveSupportState } from '../domain/support-mode.js';
import type { SupportSessionRepository } from '../repositories/support-session.repository.js';

export type SupportModeServiceDependencies = {
  readonly tenants: TenantRepository;
  readonly supportSessions: SupportSessionRepository;
  readonly clock?: () => Date;
};

export type SupportEntryMetadata = {
  readonly ip: string | null;
  readonly userAgent: string | null;
};

type RequestSession = FastifyRequest['session'];

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

export function clearSupportSessionFields(session: RequestSession): void {
  session.supportMode = false;
  session.supportTenantId = null;
  session.supportStartedAt = null;
  session.supportSessionId = null;
}

export function createSupportModeService(deps: SupportModeServiceDependencies) {
  const now = deps.clock ?? (() => new Date());

  return {
    async enter(
      session: RequestSession,
      auth: AuthenticatedRequestContext,
      tenantId: string,
      metadata: SupportEntryMetadata = { ip: auth.ip, userAgent: auth.userAgent },
    ): Promise<ActiveSupportState> {
      if (auth.support.active || session.supportMode === true) {
        throw new ConflictError('Já existe um modo suporte ativo nesta sessão.');
      }

      const tenant = await deps.tenants.findById(tenantId);
      if (!tenant) {
        throw new NotFoundError('Empresa não encontrada.');
      }
      if (tenant.status !== 'ACTIVE') {
        throw new ValidationError('Empresa inativa não pode ser acessada em modo suporte.');
      }

      // Fecha órfãos da mesma sessão Redis antes de abrir (corridas / limpezas parciais).
      if (session.sessionId) {
        await deps.supportSessions.endOpenByRedisSessionId(session.sessionId, now());
      }

      const startedAt = now();
      let record;
      try {
        record = await deps.supportSessions.create({
          operatorUserId: auth.userId,
          tenantId: tenant.id,
          startedAt,
          redisSessionId: session.sessionId || null,
          ip: metadata.ip,
          userAgent: metadata.userAgent,
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ConflictError('Já existe um modo suporte ativo nesta sessão.');
        }
        throw error;
      }

      session.supportMode = true;
      session.supportTenantId = tenant.id;
      session.supportStartedAt = startedAt.toISOString();
      session.supportSessionId = record.id;

      try {
        await session.save();
      } catch (error) {
        clearSupportSessionFields(session);
        await deps.supportSessions.end(record.id, now());
        throw error;
      }

      return {
        active: true,
        tenantId: tenant.id,
        tenantDisplayName: tenant.displayName,
        startedAt: startedAt.toISOString(),
        supportSessionId: record.id,
      };
    },

    async exit(session: RequestSession): Promise<void> {
      const supportSessionId =
        session.supportMode === true && typeof session.supportSessionId === 'string'
          ? session.supportSessionId
          : null;

      if (supportSessionId) {
        await deps.supportSessions.end(supportSessionId, now());
      }

      clearSupportSessionFields(session);
      await session.save();
    },
  };
}

export type SupportModeService = ReturnType<typeof createSupportModeService>;
