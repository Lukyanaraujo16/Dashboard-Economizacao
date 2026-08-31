import { describe, expect, it } from 'vitest';

import {
  hasOperationalDashboardTenant,
  resolveOperationalTenantId,
} from '../src/components/dashboard/dashboard-overview-view';
import { mockAuthenticatedUser } from './helpers/render-with-auth';

describe('resolveOperationalTenantId', () => {
  it('USER usa tenant da sessão', () => {
    expect(
      resolveOperationalTenantId(mockAuthenticatedUser, { active: false }),
    ).toBe('tenant-1');
  });

  it('ADMIN sem suporte não tem tenant operacional', () => {
    expect(
      resolveOperationalTenantId(
        { ...mockAuthenticatedUser, role: 'ADMIN', tenantId: null },
        { active: false },
      ),
    ).toBeNull();
  });

  it('Support Mode usa tenant suportado', () => {
    expect(
      resolveOperationalTenantId(
        { ...mockAuthenticatedUser, role: 'SUPER_ADMIN', tenantId: null },
        {
          active: true,
          tenantId: 'tenant-support',
          tenantDisplayName: 'Empresa suporte',
          startedAt: '2026-01-01T00:00:00.000Z',
          supportSessionId: 'ss-1',
        },
      ),
    ).toBe('tenant-support');
  });

  it('hasOperationalDashboardTenant espelha resolveOperationalTenantId', () => {
    expect(hasOperationalDashboardTenant(mockAuthenticatedUser, { active: false })).toBe(true);
    expect(
      hasOperationalDashboardTenant(
        { ...mockAuthenticatedUser, role: 'ADMIN', tenantId: null },
        { active: false },
      ),
    ).toBe(false);
  });
});
