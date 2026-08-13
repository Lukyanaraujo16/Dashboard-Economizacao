import type { FastifyInstance } from 'fastify';
import session from '@fastify/session';

import type { Environment } from '../../config/env.js';
import { buildSessionOptions } from '../../modules/auth/config/session-config.js';

/**
 * Fundação 1.1A: registra o plugin de sessão com opções seguras de base.
 * Não cria login, identidade autenticada nem cookies de autenticação ativos
 * (saveUninitialized=false evita persistir sessão vazia).
 */
export async function registerSessionPlugin(
  app: FastifyInstance,
  environment: Environment,
): Promise<void> {
  await app.register(session, buildSessionOptions(environment));
}
