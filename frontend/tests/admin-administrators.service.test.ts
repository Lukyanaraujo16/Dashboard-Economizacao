import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  adminAdministratorBlockPath,
  adminAdministratorPath,
  adminAdministratorResetPasswordPath,
  adminAdministratorsPath,
} from '../src/lib/api-config';
import {
  blockAdministrator,
  createAdministrator,
  getAdministrator,
  listAdministrators,
  resetAdministratorPassword,
} from '../src/services/admin/administrators';

const sampleAdmin = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Admin Teste',
  email: 'admin@platform.test',
  role: 'ADMIN' as const,
  status: 'ACTIVE' as const,
  tenantId: null,
  createdAt: '2026-08-15T10:00:00.000Z',
  updatedAt: '2026-08-15T10:00:00.000Z',
  deactivatedAt: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('admin administrators service', () => {
  it('listAdministrators usa credentials include', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [sampleAdmin],
            pagination: { limit: 10, offset: 0, total: 1, hasMore: false },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await listAdministrators({ limit: 10, offset: 0 });

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(`${adminAdministratorsPath()}?limit=10&offset=0`);
    expect(init?.credentials).toBe('include');
  });

  it('createAdministrator envia payload mínimo sem role/tenantId', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(sampleAdmin), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await createAdministrator({
      name: 'Admin Teste',
      email: 'admin@platform.test',
      password: 'Password#12345',
    });

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(adminAdministratorsPath());
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'Admin Teste',
      email: 'admin@platform.test',
      password: 'Password#12345',
    });
  });

  it('404 de SUPER_ADMIN mapeia como Administrador não encontrado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'NOT_FOUND', message: 'Administrador não encontrado.' },
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(getAdministrator(sampleAdmin.id)).rejects.toMatchObject({
      kind: 'not_found',
      message: 'Administrador não encontrado.',
    });
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(
      adminAdministratorPath(sampleAdmin.id),
    );
  });

  it('409 do último ADMIN preserva mensagem amigável', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'CONFLICT',
              message: 'A plataforma deve preservar ao menos um administrador operacional ativo.',
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(blockAdministrator(sampleAdmin.id)).rejects.toMatchObject({
      kind: 'conflict',
      message: 'A plataforma deve preservar ao menos um administrador operacional ativo.',
    });
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(
      adminAdministratorBlockPath(sampleAdmin.id),
    );
  });

  it('resetAdministratorPassword envia confirmação e parseia user sem senha', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok', user: sampleAdmin }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const result = await resetAdministratorPassword(sampleAdmin.id, {
      password: 'Password#12345',
      passwordConfirmation: 'Password#12345',
    });

    expect(result).toEqual(sampleAdmin);
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(adminAdministratorResetPasswordPath(sampleAdmin.id));
    expect(JSON.parse(String(init?.body))).toEqual({
      password: 'Password#12345',
      passwordConfirmation: 'Password#12345',
    });
  });
});
