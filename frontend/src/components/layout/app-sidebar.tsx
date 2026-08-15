'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { isPlatformRole, useAuth } from '../../auth';
import { PlatformBrandMark } from '../../login/platform-brand-mark';
import { useTheme } from '../../theme';
import { Button, Typography } from '../ui';
import styles from './app-shell.module.css';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', platformOnly: false },
  { href: '/empresas', label: 'Empresas', platformOnly: true },
  { href: '/administradores', label: 'Administradores', platformOnly: true },
] as const;

const PLATFORM_BRAND_NAME = 'Economização';
const BRAND_SUBTITLE = 'Dashboard financeiro';

export function AppSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const brandName = theme.brandName?.trim() || PLATFORM_BRAND_NAME;
  const logoUrl = theme.logoUrl;

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.platformOnly || (user && isPlatformRole(user.role)),
  );

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
        <PlatformBrandMark
          size={36}
          className={styles.brandMark}
          logoUrl={logoUrl}
          alt={brandName}
        />
        <div className={styles.brandText}>
          <Typography as="span" variant="label" className={styles.brandName}>
            {brandName}
          </Typography>
          <Typography as="span" variant="caption" className={styles.brandTag}>
            {BRAND_SUBTITLE}
          </Typography>
        </div>
      </div>

      <nav className={styles.nav} aria-label="Seções">
        {visibleItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={styles.navItem}
              aria-current={isActive ? 'page' : undefined}
            >
              {item.label}
            </Link>
          );
        })}
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
