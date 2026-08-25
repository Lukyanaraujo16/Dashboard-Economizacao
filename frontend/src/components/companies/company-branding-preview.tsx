'use client';

import type { CSSProperties } from 'react';

import { PlatformBrandMark } from '../../login/platform-brand-mark';
import type { BrandColorOverrides } from '../../services/admin/branding.types';
import {
  resolveTheme,
  themeToCssVariables,
  type ResolvedColorScheme,
  type TenantBrandingInput,
} from '../../theme';
import { Badge, Button, Card, Stack, Typography } from '../ui';
import styles from './companies.module.css';

type CompanyBrandingPreviewProps = {
  readonly companyName: string;
  readonly logoUrl: string | null;
  readonly iconUrl: string | null;
  readonly colorScheme: ResolvedColorScheme;
  readonly light: BrandColorOverrides | null;
  readonly dark: BrandColorOverrides | null;
};

export function CompanyBrandingPreview({
  companyName,
  logoUrl,
  iconUrl,
  colorScheme,
  light,
  dark,
}: CompanyBrandingPreviewProps) {
  const branding: TenantBrandingInput = {
    name: companyName,
    logoUrl,
    iconUrl,
    light: light ?? undefined,
    dark: dark ?? undefined,
  };

  const theme = resolveTheme({
    preference: colorScheme,
    branding,
  });
  const cssVars = themeToCssVariables(theme) as CSSProperties;

  return (
    <div
      className={styles.appearancePreviewPanel}
      style={cssVars}
      data-theme={theme.colorScheme}
      data-testid="company-branding-preview"
    >
      <div className={styles.appearancePreviewWindow} aria-hidden="true">
        <span className={styles.appearancePreviewDot} />
        <span className={styles.appearancePreviewDot} />
        <span className={styles.appearancePreviewDot} />
      </div>

      <header className={styles.appearancePreviewChrome}>
        <div className={styles.appearancePreviewBrand}>
          <PlatformBrandMark size={40} variant="compact" logoUrl={theme.iconUrl} decorative />
          <div className={styles.appearancePreviewBrandText}>
            <Typography as="p" variant="label" className={styles.appearancePreviewName}>
              {companyName}
            </Typography>
            <Typography as="p" variant="caption" className={styles.appearancePreviewCaption}>
              Espaço da empresa · {colorScheme === 'light' ? 'tema claro' : 'tema escuro'}
            </Typography>
          </div>
        </div>
        <Badge variant="info">Identidade</Badge>
      </header>

      <div className={styles.appearancePreviewBody}>
        <Card className={styles.appearancePreviewCard}>
          <Stack gap={3}>
            <div className={styles.appearancePreviewMetric}>
              <Typography as="p" variant="caption" className={styles.appearancePreviewCaption}>
                Indicador
              </Typography>
              <div className={styles.appearancePreviewMetricBar} aria-hidden="true" />
              <Typography as="p" variant="caption" className={styles.appearancePreviewAccent}>
                Destaque da marca
              </Typography>
            </div>

            <Stack direction="horizontal" gap={2} wrap>
              <Button size="sm" variant="primary" type="button">
                Ação principal
              </Button>
              <Button size="sm" variant="secondary" type="button">
                Ação secundária
              </Button>
            </Stack>

            <Stack direction="horizontal" gap={2} wrap>
              <Badge variant="success">Confirmado</Badge>
              <Badge variant="warning">Atenção</Badge>
              <Badge variant="danger">Crítico</Badge>
            </Stack>
          </Stack>
        </Card>
      </div>
    </div>
  );
}
