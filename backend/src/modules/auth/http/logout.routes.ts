import type { FastifyInstance } from 'fastify';

import { SESSION_COOKIE_NAME } from '../config/session-config.js';

function clearSessionCookie(reply: {
  clearCookie: (name: string, options: Record<string, unknown>) => unknown;
}): void {
  reply.clearCookie(SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

/**
 * POST /auth/logout — destrói apenas a sessão atual (1.1F-E.3).
 *
 * Idempotente: sessão ausente/expirada/inválida ainda responde 200 `{ status: "ok" }`
 * e tenta expirar o cookie, sem enumerar estado de autenticação (docs/09.7).
 * Não usa requireAuthentication — logout não deve falhar com 401.
 */
export async function registerLogoutRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/logout', async (request, reply) => {
    try {
      if (request.session) {
        await request.session.destroy();
      }
    } catch {
      // Sessão já inválida/expirada no store — logout permanece bem-sucedido para o cliente.
    }

    clearSessionCookie(reply);
    return reply.status(200).send({ status: 'ok' as const });
  });
}
