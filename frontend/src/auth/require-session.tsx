'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '../auth';
import { SessionErrorState } from '../components/layout/session-error-state';
import { SessionLoadingState } from '../components/layout/session-loading-state';

type RequireSessionProps = {
  readonly children: ReactNode;
};

/**
 * Guard de UX/roteamento baseado em AuthProvider.
 * Não é fronteira de segurança — APIs privadas continuam exigindo requireAuthentication no backend.
 */
export function RequireSession({ children }: RequireSessionProps) {
  const router = useRouter();
  const { status, refreshSession } = useAuth();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return <SessionLoadingState />;
  }

  if (status === 'error') {
    return <SessionErrorState onRetry={() => void refreshSession().catch(() => undefined)} />;
  }

  if (status === 'unauthenticated') {
    return <SessionLoadingState label="Redirecionando para o login" />;
  }

  return children;
}
