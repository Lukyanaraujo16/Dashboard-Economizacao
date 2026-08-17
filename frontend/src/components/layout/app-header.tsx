'use client';

import Link from 'next/link';

import styles from './app-shell.module.css';
import { useOptionalShellBreadcrumbs } from './shell-breadcrumb-context';
import { resolveShellSystemBar, type ShellBreadcrumb } from './shell-page-meta';
import { ThemeControl } from './theme-control';

type AppHeaderProps = {
  readonly pathname: string;
};

function BreadcrumbTrail({ items }: { readonly items: readonly ShellBreadcrumb[] }) {
  return (
    <nav className={styles.breadcrumb} aria-label="Trilha de navegação">
      <ol className={styles.breadcrumbList}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className={styles.breadcrumbItem}>
              {index > 0 ? (
                <span className={styles.breadcrumbSep} aria-hidden="true">
                  /
                </span>
              ) : null}
              {item.href && !isLast ? (
                <Link href={item.href} className={styles.breadcrumbLink}>
                  {item.label}
                </Link>
              ) : (
                <span
                  className={styles.breadcrumbCurrent}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * System Bar — barra global de contexto/ações.
 * Não exibe título grande da página (hierarquia fica no conteúdo).
 */
export function AppHeader({ pathname }: AppHeaderProps) {
  const override = useOptionalShellBreadcrumbs();
  const routeMeta = resolveShellSystemBar(pathname);
  const breadcrumbs = override?.breadcrumbs ?? routeMeta.breadcrumbs;

  return (
    <header className={styles.systemBar} role="banner" aria-label="Barra do sistema">
      <div className={styles.systemBarInner}>
        <div className={styles.systemBarStart}>
          {breadcrumbs && breadcrumbs.length > 0 ? <BreadcrumbTrail items={breadcrumbs} /> : null}
        </div>
        <div className={styles.systemBarEnd}>
          <ThemeControl />
        </div>
      </div>
    </header>
  );
}
