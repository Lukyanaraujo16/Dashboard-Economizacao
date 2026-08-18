import type { AuthenticatedRequestContext } from '../modules/auth/domain/authentication-context.js';
import type { UserRole } from '../modules/auth/domain/types.js';

declare module 'fastify' {
  interface Session {
    /** Marcador exclusivo de rotas de teste (1.1B). Não usar em produto. */
    testMarker?: string;

    /** Authentication Context (1.1D) — preenchido apenas após login válido. */
    userId?: string;
    tenantId?: string | null;
    role?: UserRole;
    createdAt?: string;
    lastAccess?: string;
    ip?: string | null;
    userAgent?: string | null;

    /** Contexto adicional de suporte; nunca substitui tenantId da identidade. */
    supportMode?: boolean;
    supportTenantId?: string | null;
    supportStartedAt?: string | null;
    supportSessionId?: string | null;
  }

  interface FastifyRequest {
    /**
     * Contexto autenticado tipado (1.1E).
     * Preenchido somente por requireAuthentication; null quando ausente.
     */
    auth: AuthenticatedRequestContext | null;
  }
}

export {};
