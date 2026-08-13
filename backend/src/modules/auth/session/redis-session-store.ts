import type { FastifyInstance, Session } from 'fastify';

type RedisClient = FastifyInstance['redis'];

export interface RedisSessionStoreOptions {
  keyPrefix: string;
  /** TTL em segundos; deve acompanhar o maxAge do cookie de sessão. */
  ttlSeconds: number;
}

export interface SessionStoreContract {
  set(sessionId: string, session: Session, callback: (error?: unknown) => void): void;
  get(sessionId: string, callback: (error: unknown, session?: Session | null) => void): void;
  destroy(sessionId: string, callback: (error?: unknown) => void): void;
}

/**
 * SessionStore baseado em Redis para @fastify/session.
 * Não armazena AUTH_SECRET, senhas ou dados de negócio.
 */
export function createRedisSessionStore(
  client: RedisClient,
  options: RedisSessionStoreOptions,
): SessionStoreContract {
  const { keyPrefix, ttlSeconds } = options;

  function buildKey(sessionId: string): string {
    return `${keyPrefix}${sessionId}`;
  }

  return {
    get(sessionId, callback) {
      void client
        .get(buildKey(sessionId))
        .then((payload: string | null) => {
          if (!payload) {
            callback(null, null);
            return;
          }

          callback(null, JSON.parse(payload) as Session);
        })
        .catch((error: unknown) => {
          callback(error);
        });
    },

    set(sessionId, session, callback) {
      const payload = JSON.stringify(session);

      void client
        .set(buildKey(sessionId), payload, 'EX', ttlSeconds)
        .then(() => {
          callback();
        })
        .catch((error: unknown) => {
          callback(error);
        });
    },

    destroy(sessionId, callback) {
      void client
        .del(buildKey(sessionId))
        .then(() => {
          callback();
        })
        .catch((error: unknown) => {
          callback(error);
        });
    },
  };
}

export function buildSessionKeyPrefix(nodeEnv: string): string {
  return `dashboard-economizacao:${nodeEnv}:session:`;
}
