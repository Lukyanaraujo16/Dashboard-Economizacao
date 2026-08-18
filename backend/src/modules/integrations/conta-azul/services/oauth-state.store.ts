import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';

import { CONTA_AZUL_OAUTH_STATE_TTL_SECONDS } from '../domain/conta-azul-oauth.js';
import type { ContaAzulOAuthState } from '../domain/types.js';

type RedisClient = FastifyInstance['redis'];

export function buildContaAzulOAuthStateKeyPrefix(nodeEnv: string): string {
  return `dashboard-economizacao:${nodeEnv}:oauth:conta-azul:state:`;
}

export type ContaAzulOAuthStateStore = {
  create(state: ContaAzulOAuthState): Promise<string>;
  consume(token: string): Promise<ContaAzulOAuthState | null>;
};

export function createContaAzulOAuthStateStore(
  redis: RedisClient,
  nodeEnv: string,
  ttlSeconds = CONTA_AZUL_OAUTH_STATE_TTL_SECONDS,
): ContaAzulOAuthStateStore {
  const prefix = buildContaAzulOAuthStateKeyPrefix(nodeEnv);

  return {
    async create(state) {
      const token = randomBytes(32).toString('base64url');
      const result = await redis.set(
        `${prefix}${token}`,
        JSON.stringify(state),
        'EX',
        ttlSeconds,
        'NX',
      );
      if (result !== 'OK') {
        throw new Error('Não foi possível persistir o state OAuth.');
      }
      return token;
    },

    async consume(token) {
      if (!token) {
        return null;
      }
      const payload = await redis.getdel(`${prefix}${token}`);
      if (!payload) {
        return null;
      }
      try {
        const parsed = JSON.parse(payload) as ContaAzulOAuthState;
        if (
          typeof parsed.tenantId !== 'string' ||
          typeof parsed.actorUserId !== 'string' ||
          typeof parsed.sessionId !== 'string'
        ) {
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    },
  };
}
