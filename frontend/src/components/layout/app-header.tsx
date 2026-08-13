'use client';

import { useState } from 'react';

import { useAuth } from '../../auth';
import { useTheme } from '../../theme';
import { Button, Stack, Typography } from '../ui';
import styles from './app-shell.module.css';

type AppHeaderProps = {
  readonly title: string;
};

export function AppHeader({ title }: AppHeaderProps) {
  const { user, logout } = useAuth();
  const { theme, setPreference } = useTheme();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function handleLogout() {
    if (loggingOut) {
      return;
    }
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await logout();
    } catch {
      setLogoutError('Não foi possível encerrar a sessão. Tente novamente.');
      setLoggingOut(false);
    }
  }

  const isDark = theme.colorScheme === 'dark';

  return (
    <header className={styles.header}>
      <div className={styles.headerLead}>
        <Typography as="h1" variant="heading" className={styles.pageTitle}>
          {title}
        </Typography>
        <Typography as="p" variant="caption" className={styles.headerUserMobile}>
          {user?.name}
        </Typography>
      </div>

      <Stack direction="horizontal" gap={3} align="center" className={styles.headerActions}>
        {logoutError ? (
          <Typography as="p" variant="caption" className={styles.logoutError} role="alert">
            {logoutError}
          </Typography>
        ) : null}
        <div className={styles.headerUserDesktop}>
          <Typography as="p" variant="label" className={styles.userName}>
            {user?.name}
          </Typography>
          <Typography as="p" variant="caption" className={styles.userEmail}>
            {user?.email}
          </Typography>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setPreference(isDark ? 'light' : 'dark')}
          aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
        >
          {isDark ? 'Tema claro' : 'Tema escuro'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={loggingOut}
          onClick={() => void handleLogout()}
        >
          Sair
        </Button>
      </Stack>
    </header>
  );
}
