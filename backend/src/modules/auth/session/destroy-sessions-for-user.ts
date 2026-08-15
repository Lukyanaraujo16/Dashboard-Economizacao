type RedisLike = {
  keys(pattern: string): Promise<string[]>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
};

/**
 * Invalida sessões Redis de um usuário (docs/16 §10 — após redefinição de senha).
 * Varre o prefixo de sessão do ambiente; não cria índice secundário nesta fase.
 */
export async function destroySessionsForUser(
  redis: RedisLike,
  keyPrefix: string,
  userId: string,
): Promise<number> {
  const keys = await redis.keys(`${keyPrefix}*`);
  if (keys.length === 0) {
    return 0;
  }

  let destroyed = 0;
  for (const key of keys) {
    const payload = await redis.get(key);
    if (!payload) {
      continue;
    }
    try {
      const session = JSON.parse(payload) as { userId?: unknown };
      if (session.userId === userId) {
        await redis.del(key);
        destroyed += 1;
      }
    } catch {
      // Payload malformado — ignora.
    }
  }

  return destroyed;
}
