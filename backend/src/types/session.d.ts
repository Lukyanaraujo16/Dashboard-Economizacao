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
  }
}

export {};
