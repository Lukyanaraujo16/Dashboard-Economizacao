import { Typography } from '../ui';
import styles from './app-shell.module.css';
import { ThemeControl } from './theme-control';

type AppHeaderProps = {
  readonly title: string;
};

export function AppHeader({ title }: AppHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerLead}>
        <Typography as="p" variant="caption" className={styles.eyebrow}>
          Visão geral
        </Typography>
        <Typography as="h1" variant="heading" className={styles.pageTitle}>
          {title}
        </Typography>
      </div>
      <ThemeControl />
    </header>
  );
}
