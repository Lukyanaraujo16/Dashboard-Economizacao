'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { cx } from '../ui/utils/cx';

import { canUseTenantSurfaces, isPlatformRole, useAuth } from '../../auth';
import { DEFAULT_PLATFORM_BRAND_NAME } from '../../services/admin/platform-branding.types';
import { useTheme } from '../../theme';
import {
  IconBarChart3,
  IconBuilding2,
  IconLayoutDashboard,
  IconLogOut,
  IconKeyRound,
  IconList,
  IconPanelLeftClose,
  IconPanelLeftOpen,
  IconSettings2,
  IconShieldUser,
} from '../ui/icons';
import styles from './app-shell.module.css';

const NAV_ITEMS = [
  {
    href: '/',
    label: 'Dashboard',
    surface: 'tenant',
    icon: IconLayoutDashboard,
  },
  {
    href: '/relatorios',
    label: 'Relatórios',
    surface: 'tenant',
    icon: IconBarChart3,
  },
  {
    href: '/operacao',
    label: 'Operação',
    surface: 'platform',
    icon: IconList,
  },
  {
    href: '/empresas',
    label: 'Empresas',
    surface: 'platform',
    icon: IconBuilding2,
  },
  {
    href: '/administradores',
    label: 'Administradores',
    surface: 'platform',
    icon: IconShieldUser,
  },
  {
    href: '/configuracoes/aparencia',
    label: 'Configurações',
    surface: 'platform',
    icon: IconSettings2,
  },
  {
    href: '/configuracoes/consultor',
    label: 'Consultor IA',
    surface: 'platform',
    icon: IconKeyRound,
  },
] as const;

export const APP_SIDEBAR_ID = 'app-sidebar';

const NAV_ICON_SIZE = 18;
const NAV_ICON_STROKE = 1.8;

/** Logotipo oficial da Economização (arte sobre fundo próprio, preservada sem alterações). */
function EconomizacaoLogo({ className }: { readonly className?: string }) {
  return (
    <img
      src="/brand/economizacao-logo-480.webp"
      srcSet="/brand/economizacao-logo-240.webp 240w, /brand/economizacao-logo-480.webp 480w"
      sizes="240px"
      width={480}
      height={87}
      alt="Economização"
      className={className}
      decoding="async"
    />
  );
}

/** Símbolo (moeda) recortado do logotipo oficial — não há arquivo isolado. */
function EconomizacaoSymbol({ className }: { readonly className?: string }) {
  return (
    <span className={className}>
      <img
        src="/brand/economizacao-logo-480.webp"
        width={320}
        height={58}
        alt="Economização"
        className={styles.brandSymbolImg}
        decoding="async"
      />
    </span>
  );
}

/**
 * Marca da sidebar recolhida: ícone do branding em runtime (tenant ou plataforma, já resolvido
 * pelo RuntimeThemeProvider para a sessão atual) ou, sem ícone / falha de carga, o símbolo oficial.
 * Montado com `key` = URL, então o estado de falha nunca passa de um ícone para outro.
 */
function CompactBrandMark({
  iconUrl,
  alt,
}: {
  readonly iconUrl: string | null;
  readonly alt: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!iconUrl || failed) {
    return <EconomizacaoSymbol className={styles.brandSymbol} />;
  }

  return (
    <span className={cx(styles.brandSymbol, styles.brandIcon)} data-brand-role="compact">
      <img
        src={iconUrl}
        width={40}
        height={40}
        alt={alt}
        className={styles.brandIconImg}
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

/** Rótulo visual ao lado do ícone, só com o menu recolhido (o nome acessível vem do próprio controle). */
function Tip({ label }: { readonly label: string }) {
  return (
    <span aria-hidden="true" className={styles.tip}>
      {label}
    </span>
  );
}

type AppSidebarProps = {
  readonly collapsed: boolean;
  readonly onToggle: () => void;
};

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const pathname = usePathname();
  const { user, support, logout } = useAuth();
  const { theme } = useTheme();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  // Nome da empresa/plataforma configurado em Aparência; a marca padrão já está no logotipo.
  const brandName = theme.brandName?.trim() || null;
  const contextName = brandName && brandName !== DEFAULT_PLATFORM_BRAND_NAME ? brandName : null;
  const iconUrl = theme.iconUrl?.trim() || null;

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.surface === 'platform') {
      return Boolean(user && isPlatformRole(user.role) && !support.active);
    }
    return canUseTenantSurfaces(user, support);
  });

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

  const ToggleIcon = collapsed ? IconPanelLeftOpen : IconPanelLeftClose;
  const toggleLabel = collapsed ? 'Expandir menu' : 'Recolher menu';

  return (
    <aside id={APP_SIDEBAR_ID} className={styles.sidebar} aria-label="Navegação principal">
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarBrand} data-testid="app-sidebar-brand">
          <EconomizacaoLogo className={styles.brandLogo} />
          {collapsed ? (
            <CompactBrandMark
              key={iconUrl ?? 'economizacao'}
              iconUrl={iconUrl}
              // Com nome da empresa (lido como texto oculto), o ícone é decorativo.
              alt={contextName ? '' : (brandName ?? DEFAULT_PLATFORM_BRAND_NAME)}
            />
          ) : null}
          {contextName ? (
            <span className={styles.brandContext} title={contextName}>
              {contextName}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls={APP_SIDEBAR_ID}
          aria-label={toggleLabel}
          className={styles.sidebarToggle}
        >
          <ToggleIcon size={NAV_ICON_SIZE} strokeWidth={NAV_ICON_STROKE} />
          {collapsed ? <Tip label={toggleLabel} /> : null}
        </button>
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
                <Icon size={NAV_ICON_SIZE} strokeWidth={NAV_ICON_STROKE} />
              </span>
              <span className={styles.navItemLabel}>{item.label}</span>
              {collapsed ? <Tip label={item.label} /> : null}
            </Link>
          );
        })}
      </nav>

      <div className={styles.sidebarFooter}>
        <div className={styles.userIdentity}>
          <p className={styles.userName} title={user?.name ?? undefined}>
            {user?.name ?? 'Usuário'}
          </p>
          <p className={styles.userEmail} title={user?.email ?? undefined}>
            {user?.email ?? ''}
          </p>
        </div>
        <button
          type="button"
          className={styles.logoutButton}
          disabled={loggingOut}
          aria-busy={loggingOut || undefined}
          onClick={() => void handleLogout()}
        >
          <IconLogOut size={16} strokeWidth={NAV_ICON_STROKE} />
          <span className={styles.logoutLabel}>Sair</span>
          {collapsed ? <Tip label="Sair" /> : null}
        </button>
        {logoutError ? (
          <p className={styles.logoutError} role="alert">
            {logoutError}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
