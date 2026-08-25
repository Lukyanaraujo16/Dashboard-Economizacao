import { afterEach, describe, expect, it, vi } from 'vitest';

import { adminTenantBrandingIconPath, adminTenantBrandingLogoPath, adminTenantBrandingPath } from '../src/lib/api-config';
import {
  deleteIcon,
  deleteLogo,
  getBranding,
  replaceBrandingColors,
  resetBranding,
  uploadIcon,
  uploadLogo,
  updateBranding,
} from '../src/services/admin/branding';
import { BrandingRequestError } from '../src/services/admin/branding.types';

const sampleBranding = {
  tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  logoUrl: null as string | null,
  iconUrl: null as string | null,
  light: { primary: '#112233' } as Record<string, string> | null,
  dark: null as Record<string, string> | null,
  createdAt: '2026-08-14T10:00:00.000Z',
  updatedAt: '2026-08-14T10:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('admin branding service', () => {
  it('getBranding usa credentials include', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(sampleBranding), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await getBranding(sampleBranding.tenantId);

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(adminTenantBrandingPath(sampleBranding.tenantId));
    expect(init?.credentials).toBe('include');
    expect(init?.method).toBe('GET');
  });

  it('uploadLogo envia FormData sem Content-Type manual', async () => {
    const withLogo = { ...sampleBranding, logoUrl: '/files/file-1' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(withLogo), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const file = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' });
    await uploadLogo(sampleBranding.tenantId, file);

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(adminTenantBrandingLogoPath(sampleBranding.tenantId));
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
    expect(init?.body).toBeInstanceOf(FormData);
    const headers = init?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
    expect(Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')).toBe(false);
  });

  it('deleteLogo trata 204', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(deleteLogo(sampleBranding.tenantId)).resolves.toBeUndefined();

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(adminTenantBrandingLogoPath(sampleBranding.tenantId));
    expect(init?.method).toBe('DELETE');
  });

  it('uploadIcon envia FormData no campo icon', async () => {
    const withIcon = { ...sampleBranding, iconUrl: '/files/icon-1' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(withIcon), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const file = new File([new Uint8Array([1, 2, 3])], 'icon.png', { type: 'image/png' });
    await uploadIcon(sampleBranding.tenantId, file);

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(adminTenantBrandingIconPath(sampleBranding.tenantId));
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get('icon')).toBeInstanceOf(File);
  });

  it('deleteIcon trata 204', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(deleteIcon(sampleBranding.tenantId)).resolves.toBeUndefined();

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(adminTenantBrandingIconPath(sampleBranding.tenantId));
    expect(init?.method).toBe('DELETE');
  });

  it('resetBranding chama DELETE branding', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await resetBranding(sampleBranding.tenantId);

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(adminTenantBrandingPath(sampleBranding.tenantId));
    expect(init?.method).toBe('DELETE');
  });

  it('updateBranding limpa scheme e reenvia tokens restantes ao remover chave', async () => {
    const cleared = { ...sampleBranding, light: null };
    const restored = { ...sampleBranding, light: { secondary: '#ABCDEF' } };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(cleared), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(restored), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
    );

    const result = await updateBranding(
      sampleBranding.tenantId,
      { light: { secondary: '#ABCDEF' } },
      { light: { primary: '#112233' }, dark: null },
    );

    expect(result.light).toEqual({ secondary: '#ABCDEF' });
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    expect(JSON.parse(String(calls[0]![1]?.body))).toEqual({ light: null });
    expect(JSON.parse(String(calls[1]![1]?.body))).toEqual({
      light: { secondary: '#ABCDEF' },
    });
  });

  it('replaceBrandingColors lê estado atual antes do PATCH', async () => {
    const empty = { ...sampleBranding, light: null, dark: null };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(sampleBranding), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(empty), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
    );

    await replaceBrandingColors(sampleBranding.tenantId, { light: null });

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]![1]?.method).toBe('GET');
    expect(calls[1]![1]?.method).toBe('PATCH');
    expect(JSON.parse(String(calls[1]![1]?.body))).toEqual({ light: null });
  });

  it('403 vira BrandingRequestError forbidden', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Negado' } }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await expect(getBranding(sampleBranding.tenantId)).rejects.toMatchObject({
      name: 'BrandingRequestError',
      kind: 'forbidden',
    } satisfies Partial<BrandingRequestError>);
  });

  it('413 mapeia arquivo grande', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'PAYLOAD_TOO_LARGE' } }), {
          status: 413,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const file = new File([new Uint8Array([1])], 'logo.png', { type: 'image/png' });
    await expect(uploadLogo(sampleBranding.tenantId, file)).rejects.toMatchObject({
      kind: 'payload_too_large',
    });
  });
});
