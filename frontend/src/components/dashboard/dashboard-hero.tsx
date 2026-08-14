import { Stack, Typography } from '../ui';
import { cx } from '../ui/utils/cx';
import { resolveGreetingPrefix } from './greeting';
import styles from './dashboard-hero.module.css';

export type DashboardHeroProps = {
  readonly displayName: string;
  readonly supportText?: string;
  readonly className?: string;
  /** Injeta horário em testes; padrão = agora. */
  readonly now?: Date;
};

/** Boas-vindas do dashboard — usa identidade autenticada, sem marketing. */
export function DashboardHero({
  displayName,
  supportText = 'Visão consolidada da operação. Os indicadores aparecerão após a sincronização dos dados.',
  className,
  now,
}: DashboardHeroProps) {
  const name = displayName.trim() || 'bem-vindo';
  const greeting = resolveGreetingPrefix(now);

  return (
    <header className={cx(styles.root, className)} data-dashboard-hero="true">
      <Stack gap={2} className={styles.copy}>
        <Typography as="h1" variant="display" className={styles.greeting}>
          {greeting}, {name}.
        </Typography>
        <Typography variant="body" className={styles.support}>
          {supportText}
        </Typography>
      </Stack>
    </header>
  );
}
