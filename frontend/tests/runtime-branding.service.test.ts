import { afterEach, describe, expect, it, vi } from 'vitest';

import { brandingCurrentPath } from '../src/lib/api-config';
import { getCurrentBranding } from '../src/services/branding/current';
import { BrandingCurrentRequestError } from '../src/services/branding/current.types';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getCurrentBranding (1.3F)', () => {
  it('busca /branding/current com credentials include', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          scope: 'tenant',
          tenantId: 't-1',
          name: 'Acme',
          logoUrl: '/files/1',
          light: { primary: '#141452' },
          dark: null,
          updatedAt: '2026-08-15T00:00:00.000Z',
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getCurrentBranding();

    expect(fetchMock).toHaveBeenCalledWith(brandingCurrentPath(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    expect(result.scope).toBe('tenant');
    expect(result.name).toBe('Acme');
    expect(result.logoUrl).toBe('/files/1');
  });

  it('401 vira BrandingCurrentRequestError unauthenticated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }),
      }),
    );

    await expect(getCurrentBranding()).rejects.toMatchObject({
      name: 'BrandingCurrentRequestError',
      kind: 'unauthenticated',
    } satisfies Partial<BrandingCurrentRequestError>);
  });

  it('resposta inválida é rejeitada', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ scope: 'tenant' }),
      }),
    );

    await expect(getCurrentBranding()).rejects.toMatchObject({
      kind: 'invalid_response',
    });
  });
});
