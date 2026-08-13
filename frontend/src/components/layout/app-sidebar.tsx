'use client';

import Link from 'next/link';

import { useAuth } from '../../auth';
import { PlatformBrandMark } from '../../login/platform-brand-mark';
import { Typography } from '../ui';
import styles from './app-shell.module.css';

export function AppSidebar() {
  const { user } = useAuth();

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
          Início
        </Link>
        <div className={styles.navFuture} aria-hidden="true">
          <span className={styles.navFutureLabel}>Módulos em preparação</span>
        </div>
      </nav>

      <div className={styles.sidebarFooter}>
        <Typography as="p" variant="label" className={styles.userName}>
          {user?.name ?? 'Usuário'}
        </Typography>
        <Typography as="p" variant="caption" className={styles.userEmail}>
          {user?.email ?? ''}
        </Typography>
      </div>
    </aside>
  );
}
