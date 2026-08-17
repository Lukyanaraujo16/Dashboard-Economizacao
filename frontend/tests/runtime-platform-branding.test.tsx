import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LoginPage from '../app/login/page';
import type { CurrentBranding } from '../src/services/branding/current.types';
import { RuntimePlatformBrandingProvider, useRuntimePlatformBranding } from '../src/theme';
import { createUnauthenticatedGetCurrentUser, renderWithAuth } from './helpers/render-with-auth';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  replaceMock.mockReset();
  document.title = '';
  document.head.querySelectorAll('link[data-runtime-favicon="true"]').forEach((el) => el.remove());
});

const platformBranding: CurrentBranding = {
  scope: 'platform',
  tenantId: null,
  name: 'Marca Pública',
  logoUrl: '/files/logo-public',
  faviconUrl: '/files/fav-public',
  light: { primary: '#123456' },
  dark: null,
  updatedAt: '2026-08-15T09:00:00.000Z',
};

function StatusProbe() {
  const { platformBranding: branding, status } = useRuntimePlatformBranding();
  return (
    <div>
      <span data-testid="platform-status">{status}</span>
      <span data-testid="platform-name">{branding?.name ?? 'null'}</span>
    </div>
  );
}

describe('RuntimePlatformBrandingProvider (1.5E)', () => {
  it('carrega branding público no mount', async () => {
    const action = vi.fn().mockResolvedValue(platformBranding);

    renderWithAuth(
      <RuntimePlatformBrandingProvider getPublicPlatformBrandingAction={action}>
        <StatusProbe />
      </RuntimePlatformBrandingProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('platform-status').textContent).toBe('ready');
    });
    expect(screen.getByTestId('platform-name').textContent).toBe('Marca Pública');
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('refresh recarrega o endpoint público', async () => {
    const action = vi
      .fn()
      .mockResolvedValueOnce(platformBranding)
      .mockResolvedValueOnce({ ...platformBranding, name: 'Marca Atualizada' });

    function RefreshButton() {
      const { refresh } = useRuntimePlatformBranding();
      return (
        <button type="button" onClick={() => void refresh()}>
          Refresh platform
        </button>
      );
    }

    renderWithAuth(
      <RuntimePlatformBrandingProvider getPublicPlatformBrandingAction={action}>
        <StatusProbe />
        <RefreshButton />
      </RuntimePlatformBrandingProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('platform-name').textContent).toBe('Marca Pública');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Refresh platform' }));

    await waitFor(() => {
      expect(screen.getByTestId('platform-name').textContent).toBe('Marca Atualizada');
    });
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('login recebe nome da plataforma pública', async () => {
    const action = vi.fn().mockResolvedValue(platformBranding);

    renderWithAuth(
      <RuntimePlatformBrandingProvider getPublicPlatformBrandingAction={action}>
        <LoginPage />
      </RuntimePlatformBrandingProvider>,
      {
        getCurrentUserAction: createUnauthenticatedGetCurrentUser(),
        hydrateOnMount: true,
      },
    );

    expect(await screen.findByText('Marca Pública')).toBeTruthy();
    await waitFor(() => {
      expect(document.title).toBe('Marca Pública');
    });
    expect(
      document.head.querySelector('link[data-runtime-favicon="true"]')?.getAttribute('href'),
    ).toContain('/files/fav-public');
  });

  it('erro de carga deixa status error e login usa fallback', async () => {
    const action = vi.fn().mockRejectedValue(new Error('offline'));

    renderWithAuth(
      <RuntimePlatformBrandingProvider getPublicPlatformBrandingAction={action}>
        <LoginPage />
        <StatusProbe />
      </RuntimePlatformBrandingProvider>,
      {
        getCurrentUserAction: createUnauthenticatedGetCurrentUser(),
        hydrateOnMount: true,
      },
    );

    await waitFor(() => {
      expect(screen.getByTestId('platform-status').textContent).toBe('error');
    });
    expect(await screen.findByText('Economização')).toBeTruthy();
  });
});
