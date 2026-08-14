import type { ReactNode } from 'react';

import { Stack, Typography } from '../ui';
import { cx } from '../ui/utils/cx';
import styles from './financial-section.module.css';

export type FinancialSectionProps = {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
  readonly className?: string;
};

/** Seção financeira padronizada — título, subtítulo e slot de conteúdo. */
export function FinancialSection({
  id,
  title,
  subtitle,
  children,
  className,
}: FinancialSectionProps) {
  const headingId = `${id}-heading`;

  return (
    <section
      id={id}
      className={cx(styles.root, className)}
      aria-labelledby={headingId}
      data-financial-section={id}
    >
      <Stack gap={1} className={styles.header}>
        <Typography as="h2" variant="heading" id={headingId} className={styles.title}>
          {title}
        </Typography>
        {subtitle ? (
          <Typography variant="body" className={styles.subtitle}>
            {subtitle}
          </Typography>
        ) : null}
      </Stack>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
