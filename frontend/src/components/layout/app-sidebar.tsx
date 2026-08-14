'use client';

import { useState } from 'react';
import Link from 'next/link';

import { useAuth } from '../../auth';
import { PlatformBrandMark } from '../../login/platform-brand-mark';
import { Button, Typography } from '../ui';
import styles from './app-shell.module.css';

export function AppSidebar() {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await logout();
    } catch {
      setLogoutError('Não foi possível encerrar a sessão. Tente novamente.');
      setLoggingOut(false);
    }
  }

  return (
    <aside className={styles.sidebar} aria-label="Navegação principal">
      <div className={styles.sidebarBrand}>
        <PlatformBrandMark size={36} className={styles.brandMark} />
        <div className={styles.brandText}>
          <Typography as="span" variant="label" className={styles.brandName}>
            Economização
          </Typography>
          <Typography as="span" variant="caption" className={styles.brandTag}>
            Dashboard financeiro
          </Typography>
        </div>
      </div>

      <nav className={styles.nav} aria-label="Seções">
        <Link href="/" className={styles.navItem} aria-current="page">
          Dashboard
        </Link>
      </nav>

      <div className={styles.sidebarFooter}>
        <div className={styles.userIdentity}>
          <Typography as="p" variant="label" className={styles.userName}>
            {user?.name ?? 'Usuário'}
          </Typography>
          <Typography as="p" variant="caption" className={styles.userEmail}>
            {user?.email ?? ''}
          </Typography>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          loading={loggingOut}
          className={styles.logoutButton}
          onClick={() => void handleLogout()}
        >
          Sair
        </Button>
        {logoutError ? (
          <Typography as="p" variant="caption" className={styles.logoutError} role="alert">
            {logoutError}
          </Typography>
        ) : null}
      </div>
    </aside>
  );
}
