import type { FastifyInstance } from 'fastify';

import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { createArgon2idPasswordHasher } from '../crypto/password-hasher.js';
import type { AuthenticationContext } from '../domain/authentication-context.js';
import { createUserCredentialRepository } from '../repositories/user-credential.repository.js';
import { createUserRepository } from '../repositories/user.repository.js';
import { parseLoginRequestBody } from '../schemas/login.schema.js';
import { createLoginService } from '../services/login.service.js';

function readUserAgent(header: string | string[] | undefined): string | null {
  if (typeof header === 'string' && header.length > 0) {
    return header;
  }
  if (Array.isArray(header) && typeof header[0] === 'string' && header[0].length > 0) {
    return header[0];
  }
  return null;
}

function destroySession(
  store: {
    destroy: (sessionId: string, callback: (error?: unknown) => void) => void;
  },
  sessionId: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    store.destroy(sessionId, (error?: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

/**
 * POST /auth/login — autenticação administrativa/usuário (1.1D).
 * Sem logout, /me ou middleware global.
 */
export async function registerLoginRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrismaClient();
  const users = createUserRepository(prisma);
  const credentials = createUserCredentialRepository(prisma);
  const passwordHasher = createArgon2idPasswordHasher();
  const loginService = createLoginService({
    users,
    credentials,
    passwordHasher,
  });

  app.post('/auth/login', async (request, reply) => {
    const body = parseLoginRequestBody(request.body);
    const principal = await loginService.authenticate(body);

    const previousSessionId = request.session.sessionId;
    await request.session.regenerate();

    const timestamp = new Date().toISOString();
    const context: AuthenticationContext = {
      userId: principal.userId,
      tenantId: principal.tenantId,
      role: principal.role,
      createdAt: timestamp,
      lastAccess: timestamp,
      ip: request.ip ?? null,
      userAgent: readUserAgent(request.headers['user-agent']),
    };

    request.session.userId = context.userId;
    request.session.tenantId = context.tenantId;
    request.session.role = context.role;
    request.session.createdAt = context.createdAt;
    request.session.lastAccess = context.lastAccess;
    request.session.ip = context.ip;
    request.session.userAgent = context.userAgent;

    await request.session.save();

    if (previousSessionId && previousSessionId !== request.session.sessionId) {
      try {
        await destroySession(request.sessionStore, previousSessionId);
      } catch {
        // Sessão anônima prévia pode já ter expirado; não aborta login autenticado.
      }
    }

    try {
      await users.registerSuccessfulLogin(principal.userId, new Date());
    } catch (error) {
      await request.session.destroy();
      throw error;
    }

    return reply.status(200).send({ status: 'ok' as const });
  });
}
