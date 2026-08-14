import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  adminTenantDisablePath,
  adminTenantPath,
  adminTenantReactivatePath,
  adminTenantsPath,
} from '../src/lib/api-config';
import {
  createCompany,
  deleteCompany,
  disableCompany,
  getCompany,
  listCompanies,
  reactivateCompany,
  updateCompany,
} from '../src/services/admin/companies';

const sampleCompany = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'acme-corp',
  displayName: 'Acme Corp',
  status: 'ACTIVE' as const,
  createdAt: '2026-08-14T10:00:00.000Z',
  updatedAt: '2026-08-14T10:00:00.000Z',
  deactivatedAt: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('admin companies service', () => {
  it('listCompanies usa credentials include', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [sampleCompany],
            pagination: { limit: 10, offset: 0, total: 1, hasMore: false },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await listCompanies({ limit: 10, offset: 0 });

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(`${adminTenantsPath()}?limit=10&offset=0`);
    expect(init?.credentials).toBe('include');
  });

  it('createCompany envia payload mínimo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(sampleCompany), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await createCompany({ name: 'Acme Corp', displayName: 'Acme Corp' });

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(adminTenantsPath());
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'Acme Corp',
      displayName: 'Acme Corp',
    });
  });

  it('409 mapeia conflito de identificador', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'CONFLICT',
              message: 'Identificador já existe.',
              details: [{ field: 'name', issue: 'already_exists' }],
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(createCompany({ name: 'dup', displayName: 'Dup' })).rejects.toMatchObject({
      kind: 'conflict',
    });
  });

  it('422 mapeia validação', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Dados inválidos.',
              details: [{ field: 'name', issue: 'required' }],
            },
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(createCompany({ name: '', displayName: '' })).rejects.toMatchObject({
      kind: 'validation',
    });
  });

  it('get/update/disable/reactivate usam credentials include', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(sampleCompany), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...sampleCompany, displayName: 'Nova' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...sampleCompany, status: 'DISABLED' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(sampleCompany), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    vi.stubGlobal('fetch', fetchMock);

    await getCompany(sampleCompany.id);
    await updateCompany(sampleCompany.id, { displayName: 'Nova' });
    await disableCompany(sampleCompany.id);
    await reactivateCompany(sampleCompany.id);

    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toEqual([
      adminTenantPath(sampleCompany.id),
      adminTenantPath(sampleCompany.id),
      adminTenantDisablePath(sampleCompany.id),
      adminTenantReactivatePath(sampleCompany.id),
    ]);

    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.credentials).toBe('include');
    }
  });

  it('deleteCompany usa DELETE com credentials include', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await deleteCompany(sampleCompany.id);

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(adminTenantPath(sampleCompany.id));
    expect(init?.method).toBe('DELETE');
    expect(init?.credentials).toBe('include');
  });
});
