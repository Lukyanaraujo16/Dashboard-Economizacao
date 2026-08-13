'use client';

import { Spinner, Stack, Typography } from '../ui';
import styles from './session-states.module.css';

type SessionLoadingStateProps = {
  readonly label?: string;
};

export function SessionLoadingState({ label = 'Verificando sessão' }: SessionLoadingStateProps) {
  return (
    <div className={styles.state} role="status" aria-live="polite">
      <Stack gap={4} align="center" className={styles.stateInner}>
        <Spinner size="lg" label={label} />
        <Typography variant="body" className={styles.stateCopy}>
          {label}…
        </Typography>
      </Stack>
    </div>
  );
}
