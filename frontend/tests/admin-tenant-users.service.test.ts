import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  adminTenantUsersPath,
  adminTenantUserPath,
  adminTenantUserResetPasswordPath,
} from '../src/lib/api-config';
import {
  createTenantUser,
  getTenantUser,
  listTenantUsers,
  resetTenantUserPassword,
} from '../src/services/admin/tenant-users';

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const sampleUser = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'User Empresa',
  email: 'user@empresa.test',
  role: 'USER' as const,
  status: 'ACTIVE' as const,
  tenantId,
  createdAt: '2026-08-15T10:00:00.000Z',
  updatedAt: '2026-08-15T10:00:00.000Z',
  deactivatedAt: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('admin tenant-users service', () => {
  it('listTenantUsers usa rota do tenant com credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [sampleUser],
            pagination: { limit: 10, offset: 0, total: 1, hasMore: false },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await listTenantUsers(tenantId, { status: 'ACTIVE', limit: 10, offset: 0 });

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(`${adminTenantUsersPath(tenantId)}?status=ACTIVE&limit=10&offset=0`);
    expect(init?.credentials).toBe('include');
  });

  it('createTenantUser não envia role nem tenantId no body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(sampleUser), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await createTenantUser(tenantId, {
      name: 'User Empresa',
      email: 'user@empresa.test',
      password: 'Password#12345',
    });

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(adminTenantUsersPath(tenantId));
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'User Empresa',
      email: 'user@empresa.test',
      password: 'Password#12345',
    });
  });

  it('cross-tenant 404 mapeia Usuário não encontrado', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Usuário não encontrado.' } }),
            { status: 404, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
    );

    await expect(getTenantUser(tenantId, sampleUser.id)).rejects.toMatchObject({
      kind: 'not_found',
      message: 'Usuário não encontrado.',
    });
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(
      adminTenantUserPath(tenantId, sampleUser.id),
    );
  });

  it('resetTenantUserPassword envia payload e retorna user', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok', user: sampleUser }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const result = await resetTenantUserPassword(tenantId, sampleUser.id, {
      password: 'Password#12345',
      passwordConfirmation: 'Password#12345',
    });

    expect(result).toEqual(sampleUser);
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(adminTenantUserResetPasswordPath(tenantId, sampleUser.id));
    expect(JSON.parse(String(init?.body))).toEqual({
      password: 'Password#12345',
      passwordConfirmation: 'Password#12345',
    });
  });
});
