'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { Typography } from '../ui';
import styles from './companies.module.css';

type CompanySectionNavProps = {
  readonly companyId: string;
  readonly companyName?: string | null;
  readonly children: ReactNode;
};

const SECTIONS = [
  { key: 'geral', label: 'Geral', href: (id: string) => `/empresas/${id}/editar` },
  { key: 'aparencia', label: 'Aparência', href: (id: string) => `/empresas/${id}/aparencia` },
  { key: 'usuarios', label: 'Usuários', href: (id: string) => `/empresas/${id}/usuarios` },
] as const;

export function CompanySectionNav({ companyId, companyName, children }: CompanySectionNavProps) {
  const pathname = usePathname();

  return (
    <div className={styles.companyHub}>
      <div className={styles.companyHubHeader}>
        {companyName ? (
          <Typography as="p" variant="caption" className={styles.companyHubEyebrow}>
            Empresa
          </Typography>
        ) : null}
        {companyName ? (
          <Typography as="h2" variant="heading" className={styles.companyHubTitle}>
            {companyName}
          </Typography>
        ) : null}
        <nav className={styles.companyHubNav} aria-label="Seções da empresa">
          {SECTIONS.map((section) => {
            const href = section.href(companyId);
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={section.key}
                href={href}
                className={styles.companyHubTab}
                aria-current={isActive ? 'page' : undefined}
                data-active={isActive ? 'true' : 'false'}
                data-testid={`company-section-${section.key}`}
              >
                {section.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className={styles.companyHubContent}>{children}</div>
    </div>
  );
}
