'use client';

import { useState } from 'react';

import { Button, Stack, Typography } from '../ui';
import styles from './session-states.module.css';

type SessionErrorStateProps = {
  readonly onRetry: () => void | Promise<void>;
};

export function SessionErrorState({ onRetry }: SessionErrorStateProps) {
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    if (retrying) {
      return;
    }
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className={styles.state} role="alert">
      <Stack gap={4} align="center" className={styles.stateInner}>
        <Typography as="h1" variant="heading" className={styles.stateTitle}>
          Não foi possível verificar sua sessão.
        </Typography>
        <Typography variant="body" className={styles.stateCopy}>
          Tente novamente em instantes. Sua conta permanece protegida.
        </Typography>
        <Button
          type="button"
          variant="primary"
          loading={retrying}
          onClick={() => void handleRetry()}
        >
          Tentar novamente
        </Button>
      </Stack>
    </div>
  );
}
