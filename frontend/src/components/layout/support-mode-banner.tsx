'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useAuth } from '../../auth';
import { exitSupportMode } from '../../services/auth/support';
import { useOptionalRuntimeTheme } from '../../theme';
import { Button, Typography } from '../ui';
import styles from './support-mode-banner.module.css';

export function SupportModeBanner() {
  const router = useRouter();
  const { support, applySession } = useAuth();
  const runtimeTheme = useOptionalRuntimeTheme();
  const [exiting, setExiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!support.active) {
    return null;
  }

  async function handleExit() {
    if (exiting) return;
    setExiting(true);
    setError(null);
    try {
      const session = await exitSupportMode();
      runtimeTheme?.clearBranding();
      applySession(session);
      router.replace('/empresas');
    } catch {
      setError('Não foi possível sair do modo suporte. Tente novamente.');
      setExiting(false);
    }
  }

  return (
    <section className={styles.banner} aria-label="Modo suporte">
      <div className={styles.inner}>
        <div className={styles.message}>
          <Typography as="span" variant="label">
            Você está prestando suporte para: {support.tenantDisplayName}
          </Typography>
          {error ? (
            <Typography as="span" variant="caption" className={styles.error} role="alert">
              {error}
            </Typography>
          ) : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={exiting}
          onClick={() => void handleExit()}
        >
          Sair do modo suporte
        </Button>
      </div>
    </section>
  );
}
