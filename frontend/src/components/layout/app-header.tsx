import { Typography } from '../ui';
import styles from './app-shell.module.css';
import { ThemeControl } from './theme-control';

type AppHeaderProps = {
  readonly context: string;
  readonly title: string;
};

export function AppHeader({ context, title }: AppHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <div className={styles.headerLead}>
          <Typography as="p" variant="caption" className={styles.eyebrow}>
            {context}
          </Typography>
          <Typography as="h1" variant="heading" className={styles.pageTitle}>
            {title}
          </Typography>
        </div>
        <ThemeControl />
      </div>
    </header>
  );
}
