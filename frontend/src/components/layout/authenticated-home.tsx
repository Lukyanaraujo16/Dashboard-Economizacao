'use client';

import { useAuth } from '../../auth';
import { Card, Stack, Typography } from '../ui';
import styles from './authenticated-home.module.css';

/**
 * Home autenticada temporária — não é o dashboard financeiro.
 */
export function AuthenticatedHome() {
  const { user } = useAuth();
  const displayName = user?.name?.trim() || 'bem-vindo';

  return (
    <Stack gap={5} className={styles.root}>
      <Stack gap={2} className={styles.intro}>
        <Typography as="h2" variant="display" className={styles.greeting}>
          Olá, {displayName}.
        </Typography>
        <Typography variant="body" className={styles.support}>
          Acompanhe este espaço: os módulos do produto serão adicionados aqui nas próximas etapas.
        </Typography>
      </Stack>

      <Card variant="elevated" className={styles.panel}>
        <Stack gap={2}>
          <Typography as="h3" variant="heading" className={styles.panelTitle}>
            Em preparação
          </Typography>
          <Typography variant="body" className={styles.panelCopy}>
            Sua área autenticada está pronta. O conteúdo do Dashboard será construído sem dados de
            demonstração ou informações financeiras fictícias.
          </Typography>
        </Stack>
      </Card>
    </Stack>
  );
}
