import type { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

/**
 * Fundação 1.1A: registra apenas a capacidade de parse/serialização de cookies.
 * Não estabelece autenticação nem sessão de usuário.
 */
export async function registerCookiePlugin(app: FastifyInstance): Promise<void> {
  await app.register(cookie);
}
