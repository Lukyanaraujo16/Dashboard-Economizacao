import {
  buildConsultantTenantRateLimitKey,
  buildConsultantUserRateLimitKey,
  resolveConsultantRateLimitPolicy,
  type ConsultantRateLimitDecision,
  type ConsultantRateLimitPolicy,
  type ConsultantRateLimiter,
} from '../domain/consultant-rate-limit.js';

export type RedisEvalClient = {
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
};

/**
 * INCR atômico + EXPIRE só na primeira ocorrência (janela fixa).
 * Evita GET seguido de INCR e não reinicia o TTL a cada incremento.
 */
const INCR_WITH_EXPIRE_IF_FIRST = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

export function createAllowAllConsultantRateLimiter(): ConsultantRateLimiter {
  return {
    async consume() {
      return { ok: true };
    },
  };
}

export function createFailingConsultantRateLimiter(): ConsultantRateLimiter {
  return {
    async consume() {
      return { ok: false, kind: 'store_unavailable' };
    },
  };
}

export function createMemoryConsultantRateLimiter(
  policy: Partial<ConsultantRateLimitPolicy> = {},
): ConsultantRateLimiter & {
  readonly counts: { user: Map<string, number>; tenant: Map<string, number> };
} {
  const resolved = resolveConsultantRateLimitPolicy(policy);
  const userCounts = new Map<string, number>();
  const tenantCounts = new Map<string, number>();

  return {
    counts: { user: userCounts, tenant: tenantCounts },
    async consume(input) {
      const userKey = `${input.tenantId}:${input.userId}`;
      const nextUser = (userCounts.get(userKey) ?? 0) + 1;
      const nextTenant = (tenantCounts.get(input.tenantId) ?? 0) + 1;
      userCounts.set(userKey, nextUser);
      tenantCounts.set(input.tenantId, nextTenant);

      if (nextUser > resolved.userMax) {
        return { ok: false, kind: 'limit', scope: 'user' };
      }
      if (nextTenant > resolved.tenantMax) {
        return { ok: false, kind: 'limit', scope: 'tenant' };
      }
      return { ok: true };
    },
  };
}

export function createRedisConsultantRateLimiter(deps: {
  readonly redis: RedisEvalClient;
  readonly nodeEnv: string;
  readonly policy?: Partial<ConsultantRateLimitPolicy>;
}): ConsultantRateLimiter {
  const policy = resolveConsultantRateLimitPolicy(deps.policy);

  async function increment(key: string): Promise<number> {
    const result = await deps.redis.eval(
      INCR_WITH_EXPIRE_IF_FIRST,
      1,
      key,
      policy.windowSeconds,
    );
    const count = typeof result === 'number' ? result : Number(result);
    if (!Number.isFinite(count)) {
      throw new Error('contador Redis inválido');
    }
    return count;
  }

  return {
    async consume(input): Promise<ConsultantRateLimitDecision> {
      const tenantId = input.tenantId.trim();
      const userId = input.userId.trim();
      if (!tenantId || !userId) {
        return { ok: false, kind: 'store_unavailable' };
      }

      try {
        const userCount = await increment(
          buildConsultantUserRateLimitKey(deps.nodeEnv, tenantId, userId),
        );
        const tenantCount = await increment(
          buildConsultantTenantRateLimitKey(deps.nodeEnv, tenantId),
        );
        if (userCount > policy.userMax) {
          return { ok: false, kind: 'limit', scope: 'user' };
        }
        if (tenantCount > policy.tenantMax) {
          return { ok: false, kind: 'limit', scope: 'tenant' };
        }
        return { ok: true };
      } catch {
        return { ok: false, kind: 'store_unavailable' };
      }
    },
  };
}
