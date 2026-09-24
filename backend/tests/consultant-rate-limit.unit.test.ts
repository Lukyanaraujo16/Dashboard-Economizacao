import { describe, expect, it } from 'vitest';

import {
  buildConsultantTenantRateLimitKey,
  buildConsultantUserRateLimitKey,
  CONSULTANT_RATE_LIMIT_TENANT_MAX,
  CONSULTANT_RATE_LIMIT_USER_MAX,
  CONSULTANT_RATE_LIMIT_WINDOW_SECONDS,
} from '../src/modules/advisor/domain/consultant-rate-limit.js';
import {
  createFailingConsultantRateLimiter,
  createMemoryConsultantRateLimiter,
  createRedisConsultantRateLimiter,
} from '../src/modules/advisor/services/consultant-rate-limiter.js';

describe('consultant rate limit (F13.6)', () => {
  it('centraliza defaults 20/60 em 10 minutos', () => {
    expect(CONSULTANT_RATE_LIMIT_USER_MAX).toBe(20);
    expect(CONSULTANT_RATE_LIMIT_TENANT_MAX).toBe(60);
    expect(CONSULTANT_RATE_LIMIT_WINDOW_SECONDS).toBe(600);
    expect(buildConsultantUserRateLimitKey('test', 'tenant-a', 'user-a')).toBe(
      'dashboard-economizacao:test:ratelimit:consultant:tenant-a:user-a',
    );
    expect(buildConsultantTenantRateLimitKey('test', 'tenant-a')).toBe(
      'dashboard-economizacao:test:ratelimit:consultant:tenant:tenant-a',
    );
  });

  it('isola contadores por user+tenant e aplica teto de tenant', async () => {
    const limiter = createMemoryConsultantRateLimiter({ userMax: 2, tenantMax: 3 });
    expect(await limiter.consume({ tenantId: 'a', userId: 'u1' })).toEqual({ ok: true });
    expect(await limiter.consume({ tenantId: 'a', userId: 'u1' })).toEqual({ ok: true });
    expect(await limiter.consume({ tenantId: 'a', userId: 'u2' })).toEqual({ ok: true });
    expect(await limiter.consume({ tenantId: 'a', userId: 'u1' })).toEqual({
      ok: false,
      kind: 'limit',
      scope: 'user',
    });
    expect(await limiter.consume({ tenantId: 'a', userId: 'u2' })).toEqual({
      ok: false,
      kind: 'limit',
      scope: 'tenant',
    });
    expect(await limiter.consume({ tenantId: 'b', userId: 'u1' })).toEqual({ ok: true });
  });

  it('INCR Redis é atômico e define TTL só na primeira ocorrência', async () => {
    const store = new Map<string, { value: number; ttl?: number }>();
    const limiter = createRedisConsultantRateLimiter({
      nodeEnv: 'test',
      policy: { userMax: 2, tenantMax: 10, windowSeconds: 600 },
      redis: {
        async eval(_script, _numKeys, key, ttl) {
          const current = store.get(String(key));
          const next = (current?.value ?? 0) + 1;
          store.set(String(key), {
            value: next,
            ttl: current?.ttl ?? Number(ttl),
          });
          return next;
        },
      },
    });

    expect(await limiter.consume({ tenantId: 'a', userId: 'u1' })).toEqual({ ok: true });
    expect(await limiter.consume({ tenantId: 'a', userId: 'u1' })).toEqual({ ok: true });
    expect(await limiter.consume({ tenantId: 'a', userId: 'u1' })).toEqual({
      ok: false,
      kind: 'limit',
      scope: 'user',
    });

    const userKey = buildConsultantUserRateLimitKey('test', 'a', 'u1');
    expect(store.get(userKey)?.ttl).toBe(600);
    expect(store.get(userKey)?.value).toBe(3);
  });

  it('concorrência: exatamente userMax permitidos', async () => {
    const limiter = createMemoryConsultantRateLimiter({ userMax: 20, tenantMax: 100 });
    const results = await Promise.all(
      Array.from({ length: 40 }, () => limiter.consume({ tenantId: 'a', userId: 'u1' })),
    );
    expect(results.filter((item) => item.ok).length).toBe(20);
    expect(results.filter((item) => item.ok === false && item.kind === 'limit').length).toBe(20);
  });

  it('falha do store não derruba com exceção bruta', async () => {
    const limiter = createRedisConsultantRateLimiter({
      nodeEnv: 'test',
      redis: {
        async eval() {
          throw new Error('redis down');
        },
      },
    });
    expect(await limiter.consume({ tenantId: 'a', userId: 'u1' })).toEqual({
      ok: false,
      kind: 'store_unavailable',
    });
    expect(await createFailingConsultantRateLimiter().consume({ tenantId: 'a', userId: 'u1' })).toEqual({
      ok: false,
      kind: 'store_unavailable',
    });
  });
});
