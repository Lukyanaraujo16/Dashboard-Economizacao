import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  deletePlatformFavicon,
  deletePlatformIcon,
  deletePlatformLogo,
  getPlatformBranding,
  resetPlatformBranding,
  savePlatformAppearance,
  savePlatformAppearanceChanges,
  updatePlatformBranding,
  uploadPlatformFavicon,
  uploadPlatformIcon,
  uploadPlatformLogo,
} from '../src/services/admin/platform-branding';
import { BrandingRequestError } from '../src/services/admin/branding.types';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const emptyBranding = {
  name: null,
  logoUrl: null,
  iconUrl: null,
  faviconUrl: null,
  light: null,
  dark: null,
  createdAt: null,
  updatedAt: null,
};

const branded = {
  name: 'Economização',
  logoUrl: '/files/logo-1',
  iconUrl: '/files/icon-1',
  faviconUrl: '/files/fav-1',
  light: { primary: '#112233', onPrimary: '#FFFFFF' },
  dark: { primary: '#AABBCC', onPrimary: '#111111' },
  createdAt: '2026-08-15T10:00:00.000Z',
  updatedAt: '2026-08-15T11:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('platform branding service', () => {
  it('getPlatformBranding lê DTO público sem config', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(emptyBranding)));

    const result = await getPlatformBranding();
    expect(result).toEqual(emptyBranding);
    expect(fetch).toHaveBeenCalledWith(
      '/admin/platform/branding',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('updatePlatformBranding envia name via PATCH', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ ...emptyBranding, name: 'Nova Marca' })),
    );

    const result = await updatePlatformBranding({ name: 'Nova Marca' });
    expect(result.name).toBe('Nova Marca');
    expect(fetch).toHaveBeenCalledWith(
      '/admin/platform/branding',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Nova Marca' }),
      }),
    );
  });

  it('savePlatformAppearance faz bootstrap de name na primeira persistência', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        return Promise.resolve(jsonResponse(emptyBranding));
      }
      const payload =
        typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      return Promise.resolve(
        jsonResponse({
          ...emptyBranding,
          name: typeof payload.name === 'string' ? payload.name : 'Economização',
          light:
            payload.light && typeof payload.light === 'object'
              ? (payload.light as Record<string, string>)
              : null,
          dark:
            payload.dark && typeof payload.dark === 'object'
              ? (payload.dark as Record<string, string>)
              : null,
          createdAt: '2026-08-15T10:00:00.000Z',
          updatedAt: '2026-08-15T10:00:00.000Z',
        }),
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    await savePlatformAppearance({
      name: 'Economização',
      light: { primary: '#112233' },
      dark: null,
    });

    const patchBodies = fetchMock.mock.calls
      .filter((call) => (call[1] as RequestInit | undefined)?.method === 'PATCH')
      .map((call) => (call[1] as RequestInit).body);

    expect(patchBodies).toContain(JSON.stringify({ name: 'Economização' }));
    expect(patchBodies).toContain(JSON.stringify({ light: { primary: '#112233' } }));
  });

  it('uploadPlatformLogo usa FormData sem Content-Type manual', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(branded)));
    const file = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' });

    await uploadPlatformLogo(file);

    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('logo')).toBeInstanceOf(File);
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('uploadPlatformFavicon usa campo favicon', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(branded)));
    const file = new File([new Uint8Array([1, 2, 3])], 'fav.png', { type: 'image/png' });

    await uploadPlatformFavicon(file);

    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit;
    expect((init.body as FormData).get('favicon')).toBeInstanceOf(File);
    expect(fetch).toHaveBeenCalledWith(
      '/admin/platform/branding/favicon',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('413 de favicon comunica limite de 512 KB', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'too big' } }, 413),
        ),
    );

    await expect(
      uploadPlatformFavicon(new File([new Uint8Array(10)], 'fav.png', { type: 'image/png' })),
    ).rejects.toMatchObject({
      kind: 'payload_too_large',
      message: expect.stringMatching(/512 KB/i),
    } satisfies Partial<BrandingRequestError>);
  });

  it('reset e deletes retornam 204', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(resetPlatformBranding()).resolves.toBeUndefined();
    await expect(deletePlatformLogo()).resolves.toBeUndefined();
    await expect(deletePlatformIcon()).resolves.toBeUndefined();
    await expect(deletePlatformFavicon()).resolves.toBeUndefined();
  });

  it('403 mapeia forbidden', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'FORBIDDEN' } }, 403)),
    );

    await expect(getPlatformBranding()).rejects.toMatchObject({ kind: 'forbidden' });
  });

  it('savePlatformAppearanceChanges sobe logo antes do PATCH e só o necessário', async () => {
    let state = { ...branded };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        return Promise.resolve(jsonResponse(state));
      }
      if (method === 'POST' && String(url).endsWith('/logo')) {
        state = { ...state, logoUrl: '/files/logo-2' };
        return Promise.resolve(jsonResponse(state));
      }
      if (method === 'PATCH') {
        const payload = JSON.parse(String(init?.body)) as { name?: string };
        state = { ...state, name: payload.name ?? state.name };
        return Promise.resolve(jsonResponse(state));
      }
      return Promise.resolve(jsonResponse(state));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await savePlatformAppearanceChanges({
      name: 'Novo Nome',
      logoFile: new File([new Uint8Array([1])], 'logo.png', { type: 'image/png' }),
    });

    expect(result.ok).toBe(true);
    expect(result.completed).toEqual(['logo', 'fields']);
    const methods = fetchMock.mock.calls.map(
      (call) => (call[1] as RequestInit | undefined)?.method,
    );
    expect(methods.indexOf('POST')).toBeLessThan(methods.lastIndexOf('PATCH'));
  });

  it('savePlatformAppearanceChanges reporta erro parcial após logo ok e PATCH falho', async () => {
    let state = { ...branded };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        if (method === 'GET') {
          return Promise.resolve(jsonResponse(state));
        }
        if (method === 'POST' && String(url).endsWith('/logo')) {
          state = { ...state, logoUrl: '/files/logo-ok' };
          return Promise.resolve(jsonResponse(state));
        }
        if (method === 'PATCH') {
          return Promise.resolve(
            jsonResponse({ error: { code: 'VALIDATION_ERROR', message: 'Falhou campos' } }, 422),
          );
        }
        return Promise.resolve(jsonResponse(state));
      }),
    );

    const result = await savePlatformAppearanceChanges({
      name: 'X',
      logoFile: new File([new Uint8Array([1])], 'logo.png', { type: 'image/png' }),
    });

    expect(result.ok).toBe(false);
    expect(result.completed).toEqual(['logo']);
    expect(result.failedStep).toBe('fields');
    expect(result.branding.logoUrl).toBe('/files/logo-ok');
  });

  it('uploadPlatformIcon usa campo icon', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(branded)));
    const file = new File([new Uint8Array([1, 2, 3])], 'icon.png', { type: 'image/png' });

    await uploadPlatformIcon(file);

    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit;
    expect((init.body as FormData).get('icon')).toBeInstanceOf(File);
    expect(fetch).toHaveBeenCalledWith(
      '/admin/platform/branding/icon',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('savePlatformAppearanceChanges sobe logo, depois ícone, depois PATCH', async () => {
    let state = { ...branded };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = String(url);
      if (method === 'GET') {
        return Promise.resolve(jsonResponse(state));
      }
      if (method === 'POST' && path.endsWith('/logo')) {
        state = { ...state, logoUrl: '/files/logo-2' };
        return Promise.resolve(jsonResponse(state));
      }
      if (method === 'POST' && path.endsWith('/icon')) {
        state = { ...state, iconUrl: '/files/icon-2' };
        return Promise.resolve(jsonResponse(state));
      }
      if (method === 'PATCH') {
        return Promise.resolve(jsonResponse(state));
      }
      return Promise.resolve(jsonResponse(state));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await savePlatformAppearanceChanges({
      name: 'Novo Nome',
      logoFile: new File([new Uint8Array([1])], 'logo.png', { type: 'image/png' }),
      iconFile: new File([new Uint8Array([1])], 'icon.png', { type: 'image/png' }),
    });

    expect(result.ok).toBe(true);
    expect(result.completed).toEqual(['logo', 'icon', 'fields']);
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.findIndex((url) => url.endsWith('/logo'))).toBeLessThan(
      urls.findIndex((url) => url.endsWith('/icon')),
    );
  });
});
