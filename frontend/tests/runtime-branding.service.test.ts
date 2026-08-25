import { afterEach, describe, expect, it, vi } from 'vitest';

import { brandingCurrentPath, brandingPlatformPath } from '../src/lib/api-config';
import { getCurrentBranding, getPublicPlatformBranding } from '../src/services/branding/current';
import { BrandingCurrentRequestError } from '../src/services/branding/current.types';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const validBody = {
  scope: 'tenant' as const,
  tenantId: 't-1',
  name: 'Acme',
  logoUrl: '/files/1',
  iconUrl: '/files/icon-1',
  faviconUrl: '/files/fav-1',
  light: { primary: '#141452' },
  dark: null,
  updatedAt: '2026-08-15T00:00:00.000Z',
};

describe('getCurrentBranding (1.3F / 1.5E)', () => {
  it('busca /branding/current com credentials include e parseia faviconUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(validBody),
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
    expect(result.faviconUrl).toBe('/files/fav-1');
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

  it('resposta inválida sem faviconUrl é rejeitada', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            scope: 'tenant',
            tenantId: 't-1',
            name: 'Acme',
            logoUrl: null,
            iconUrl: null,
            light: null,
            dark: null,
            updatedAt: null,
          }),
      }),
    );

    await expect(getCurrentBranding()).rejects.toMatchObject({
      kind: 'invalid_response',
    });
  });
});

describe('getPublicPlatformBranding (1.5E)', () => {
  it('busca /branding/platform e retorna shape CurrentBranding', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          scope: 'platform',
          tenantId: null,
          name: 'Economização',
          logoUrl: '/files/logo-p',
          iconUrl: '/files/icon-p',
          faviconUrl: '/files/fav-p',
          light: { primary: '#010101' },
          dark: null,
          updatedAt: '2026-08-15T01:00:00.000Z',
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getPublicPlatformBranding();

    expect(fetchMock).toHaveBeenCalledWith(brandingPlatformPath(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    expect(result.scope).toBe('platform');
    expect(result.tenantId).toBeNull();
    expect(result.faviconUrl).toBe('/files/fav-p');
    expect(result.logoUrl).toBe('/files/logo-p');
  });
});
