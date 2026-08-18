'use client';

import type { ReactNode } from 'react';

import { useAuth } from './auth-provider';
import { isPlatformRole } from './platform-roles';
import { SessionLoadingState } from '../components/layout/session-loading-state';
import { Button, Typography } from '../components/ui';
import styles from '../components/layout/platform-access-denied.module.css';

type RequirePlatformRoleProps = {
  readonly children: ReactNode;
};

function PlatformAccessDeniedState() {
  return (
    <div className={styles.root} role="alert">
      <Typography as="h2" variant="heading" className={styles.title}>
        Acesso não permitido
      </Typography>
      <Typography as="p" variant="body" className={styles.message}>
        Você não tem permissão para acessar esta área administrativa.
      </Typography>
      <Button type="button" variant="secondary" size="sm" onClick={() => window.history.back()}>
        Voltar
      </Button>
    </div>
  );
}

/**
 * Guard de UX para rotas administrativas de plataforma.
 * Não substitui autorização no backend.
 */
export function RequirePlatformRole({ children }: RequirePlatformRoleProps) {
  const { status, user, support } = useAuth();

  if (status === 'loading') {
    return <SessionLoadingState />;
  }

  if (status !== 'authenticated' || !user || !isPlatformRole(user.role) || support.active) {
    return <PlatformAccessDeniedState />;
  }

  return children;
}
