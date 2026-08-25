import { describe, expect, it } from 'vitest';

import {
  PLATFORM_LANDING_PATH,
  TENANT_HOME_PATH,
  canUseTenantSurfaces,
  resolveAuthenticatedHomePath,
} from '../src/auth';
import type { AuthenticatedUser, SupportState } from '../src/auth/types';

const tenantUser: AuthenticatedUser = {
  id: 'user-1',
  name: 'Usuário',
  email: 'user@empresa.com',
  role: 'USER',
  tenantId: 'tenant-1',
};

const admin: AuthenticatedUser = {
  id: 'admin-1',
  name: 'Admin',
  email: 'admin@plataforma.com',
  role: 'ADMIN',
  tenantId: null,
};

const superAdmin: AuthenticatedUser = {
  ...admin,
  id: 'super-1',
  role: 'SUPER_ADMIN',
  email: 'super@plataforma.com',
};

const inactive: SupportState = { active: false };
const activeSupport: SupportState = {
  active: true,
  tenantId: 'tenant-a',
  tenantDisplayName: 'Empresa A',
  startedAt: '2026-08-17T12:00:00.000Z',
  supportSessionId: 'support-1',
};

describe('canUseTenantSurfaces', () => {
  it('USER vê superfícies de tenant', () => {
    expect(canUseTenantSurfaces(tenantUser, inactive)).toBe(true);
  });

  it('ADMIN/SUPER_ADMIN sem Support Mode não vêem superfícies de tenant', () => {
    expect(canUseTenantSurfaces(admin, inactive)).toBe(false);
    expect(canUseTenantSurfaces(superAdmin, inactive)).toBe(false);
  });

  it('ADMIN/SUPER_ADMIN com Support Mode vêem superfícies de tenant', () => {
    expect(canUseTenantSurfaces(admin, activeSupport)).toBe(true);
    expect(canUseTenantSurfaces(superAdmin, activeSupport)).toBe(true);
  });

  it('sem usuário autenticado não libera superfície de tenant', () => {
    expect(canUseTenantSurfaces(null, inactive)).toBe(false);
    expect(canUseTenantSurfaces(null, activeSupport)).toBe(false);
  });
});

describe('resolveAuthenticatedHomePath', () => {
  it('USER cai na Dashboard', () => {
    expect(resolveAuthenticatedHomePath(tenantUser, inactive)).toBe(TENANT_HOME_PATH);
  });

  it('plataforma sem Support Mode cai em /empresas', () => {
    expect(resolveAuthenticatedHomePath(admin, inactive)).toBe(PLATFORM_LANDING_PATH);
    expect(resolveAuthenticatedHomePath(superAdmin, inactive)).toBe(PLATFORM_LANDING_PATH);
  });

  it('plataforma com Support Mode cai na Dashboard do tenant assistido', () => {
    expect(resolveAuthenticatedHomePath(admin, activeSupport)).toBe(TENANT_HOME_PATH);
    expect(resolveAuthenticatedHomePath(superAdmin, activeSupport)).toBe(TENANT_HOME_PATH);
  });
});
