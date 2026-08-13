import type { FastifyInstance } from 'fastify';

type RedisClient = FastifyInstance['redis'];

export async function isRedisHealthy(redis: RedisClient | undefined): Promise<boolean> {
  if (!redis) {
    return false;
  }

  try {
    const response = await redis.ping();
    return response === 'PONG';
  } catch {
    return false;
  }
}
