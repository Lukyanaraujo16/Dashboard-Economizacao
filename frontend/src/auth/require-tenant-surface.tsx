'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { SessionLoadingState } from '../components/layout/session-loading-state';
import { useAuth } from './auth-provider';
import { PLATFORM_LANDING_PATH, canUseTenantSurfaces } from './tenant-surfaces';

type RequireTenantSurfaceProps = {
  readonly children: ReactNode;
};

/**
 * Guard de UX: papel de plataforma sem Support Mode não permanece em
 * Dashboard/Relatórios. Segurança de dados continua no backend.
 */
export function RequireTenantSurface({ children }: RequireTenantSurfaceProps) {
  const router = useRouter();
  const { status, user, support } = useAuth();
  const shouldRedirect =
    status === 'authenticated' && user !== null && !canUseTenantSurfaces(user, support);

  useEffect(() => {
    if (shouldRedirect) {
      router.replace(PLATFORM_LANDING_PATH);
    }
  }, [shouldRedirect, router]);

  if (shouldRedirect) {
    return <SessionLoadingState label="Redirecionando" />;
  }

  return children;
}
