'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { isPlatformRole, useAuth } from '../../auth';
import { PlatformBrandMark } from '../../login/platform-brand-mark';
import { DEFAULT_PLATFORM_BRAND_NAME } from '../../services/admin/platform-branding.types';
import { useTheme } from '../../theme';
import { Button, Typography } from '../ui';
import {
  IconBuilding2,
  IconLayoutDashboard,
  IconLogOut,
  IconSettings2,
  IconShieldUser,
} from '../ui/icons';
import styles from './app-shell.module.css';

const NAV_ITEMS = [
  {
    href: '/',
    label: 'Dashboard',
    platformOnly: false,
    icon: IconLayoutDashboard,
  },
  {
    href: '/empresas',
    label: 'Empresas',
    platformOnly: true,
    icon: IconBuilding2,
  },
  {
    href: '/administradores',
    label: 'Administradores',
    platformOnly: true,
    icon: IconShieldUser,
  },
  {
    href: '/configuracoes/aparencia',
    label: 'Configurações',
    platformOnly: true,
    icon: IconSettings2,
  },
] as const;

const BRAND_SUBTITLE = 'Dashboard financeiro';

export function AppSidebar() {
  const pathname = usePathname();
  const { user, support, logout } = useAuth();
  const { theme } = useTheme();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const brandName = theme.brandName?.trim() || DEFAULT_PLATFORM_BRAND_NAME;
  const logoUrl = theme.logoUrl;

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.platformOnly || (user && isPlatformRole(user.role) && !support.active),
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
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={styles.navItem}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={styles.navItemIcon} aria-hidden="true">
                <Icon size={18} />
              </span>
              <span className={styles.navItemLabel}>{item.label}</span>
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
          <IconLogOut size={18} />
          <span>Sair</span>
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
