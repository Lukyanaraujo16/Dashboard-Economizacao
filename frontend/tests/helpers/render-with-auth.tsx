import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { vi } from 'vitest';

import { AuthProvider } from '../../src/auth';
import type { AuthenticatedUser, SupportState } from '../../src/auth/types';
import type { getCurrentUser } from '../../src/services/auth/me';
import type { logout } from '../../src/services/auth/logout';

export const mockAuthenticatedUser: AuthenticatedUser = {
  id: 'user-1',
  name: 'Usuário Teste',
  email: 'user@empresa.com',
  role: 'USER',
  tenantId: 'tenant-1',
};

export function createUnauthenticatedGetCurrentUser(): typeof getCurrentUser {
  return vi.fn().mockResolvedValue({ kind: 'unauthenticated' });
}

export function createAuthenticatedGetCurrentUser(
  user: AuthenticatedUser = mockAuthenticatedUser,
  support: SupportState = { active: false },
): typeof getCurrentUser {
  return vi.fn().mockResolvedValue({ kind: 'authenticated', user, support });
}

export function renderWithAuth(
  ui: ReactElement,
  options?: {
    readonly getCurrentUserAction?: typeof getCurrentUser;
    readonly logoutAction?: typeof logout;
    readonly hydrateOnMount?: boolean;
  },
) {
  const getCurrentUserAction =
    options?.getCurrentUserAction ?? createUnauthenticatedGetCurrentUser();
  const logoutAction =
    options?.logoutAction ?? vi.fn().mockResolvedValue({ status: 'ok' as const });

  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <AuthProvider
        getCurrentUserAction={getCurrentUserAction}
        logoutAction={logoutAction}
        hydrateOnMount={options?.hydrateOnMount ?? false}
      >
        {children}
      </AuthProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper }),
    getCurrentUserAction,
    logoutAction,
  };
}
