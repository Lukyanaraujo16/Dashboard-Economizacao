import { describe, expect, it } from 'vitest';

import type { AuthenticatedRequestContext } from '../src/modules/auth/domain/authentication-context.js';
import { resolveOperationalTenantId } from '../src/modules/dashboard/domain/operational-tenant.js';

function auth(
  partial: Pick<AuthenticatedRequestContext, 'role' | 'tenantId' | 'support'>,
): AuthenticatedRequestContext {
  return {
    userId: 'user',
    sessionId: 'session',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastAccess: '2026-01-01T00:00:00.000Z',
    ip: null,
    userAgent: null,
    ...partial,
  };
}

describe('resolveOperationalTenantId', () => {
  it('USER usa tenant da sessão', () => {
    expect(
      resolveOperationalTenantId(
        auth({ role: 'USER', tenantId: 'tenant-a', support: { active: false } }),
      ),
    ).toBe('tenant-a');
  });

  it('ADMIN e SUPER_ADMIN sem suporte não têm tenant operacional', () => {
    expect(
      resolveOperationalTenantId(
        auth({ role: 'ADMIN', tenantId: null, support: { active: false } }),
      ),
    ).toBeNull();
    expect(
      resolveOperationalTenantId(
        auth({ role: 'SUPER_ADMIN', tenantId: null, support: { active: false } }),
      ),
    ).toBeNull();
  });

  it('Support Mode usa o tenant suportado', () => {
    expect(
      resolveOperationalTenantId(
        auth({
          role: 'SUPER_ADMIN',
          tenantId: null,
          support: {
            active: true,
            tenantId: 'tenant-support',
            startedAt: '2026-01-01T00:00:00.000Z',
            supportSessionId: 'ss',
          },
        }),
      ),
    ).toBe('tenant-support');
  });
});
