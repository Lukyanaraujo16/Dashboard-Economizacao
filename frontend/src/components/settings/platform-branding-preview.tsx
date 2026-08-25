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
import { cx } from '../ui/utils/cx';
import companyStyles from '../companies/companies.module.css';
import styles from './settings.module.css';

type PlatformBrandingPreviewProps = {
  readonly platformName: string;
  readonly logoUrl: string | null;
  readonly iconUrl: string | null;
  readonly colorScheme: ResolvedColorScheme;
  readonly light: BrandColorOverrides | null;
  readonly dark: BrandColorOverrides | null;
};

export function PlatformBrandingPreview({
  platformName,
  logoUrl,
  iconUrl,
  colorScheme,
  light,
  dark,
}: PlatformBrandingPreviewProps) {
  const branding: TenantBrandingInput = {
    name: platformName,
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
      className={companyStyles.appearancePreviewPanel}
      style={cssVars}
      data-theme={theme.colorScheme}
      data-testid="platform-branding-preview"
    >
      <div className={companyStyles.appearancePreviewWindow} aria-hidden="true">
        <span className={companyStyles.appearancePreviewDot} />
        <span className={companyStyles.appearancePreviewDot} />
        <span className={companyStyles.appearancePreviewDot} />
      </div>

      <header className={companyStyles.appearancePreviewChrome}>
        <div className={companyStyles.appearancePreviewBrand}>
          <div className={styles.previewMarkFrame} data-fit="contain" aria-hidden="true">
            <PlatformBrandMark size={40} variant="compact" logoUrl={theme.iconUrl} decorative />
          </div>
          <div className={companyStyles.appearancePreviewBrandText}>
            <Typography as="p" variant="label" className={companyStyles.appearancePreviewName}>
              {platformName}
            </Typography>
            <Typography as="p" variant="caption" className={companyStyles.appearancePreviewCaption}>
              Plataforma · {colorScheme === 'light' ? 'tema claro' : 'tema escuro'}
            </Typography>
          </div>
        </div>
        <Badge variant="info">Plataforma</Badge>
      </header>

      <div className={companyStyles.appearancePreviewBody}>
        <Card className={companyStyles.appearancePreviewCard}>
          <Stack gap={3}>
            <div className={companyStyles.appearancePreviewMetric}>
              <Typography
                as="p"
                variant="caption"
                className={companyStyles.appearancePreviewCaption}
              >
                Superfície
              </Typography>
              <div className={companyStyles.appearancePreviewMetricBar} aria-hidden="true" />
              <Typography
                as="p"
                variant="caption"
                className={companyStyles.appearancePreviewAccent}
              >
                Destaque da marca
              </Typography>
            </div>

            <Stack direction="horizontal" gap={2} wrap>
              <Button size="sm" variant="primary" type="button" tabIndex={-1}>
                Ação principal
              </Button>
              <Button size="sm" variant="secondary" type="button" tabIndex={-1}>
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

        <div
          className={styles.loginPreview}
          data-testid="platform-login-preview"
          aria-label="Prévia ilustrativa da tela de login"
        >
          <Typography as="p" variant="caption" className={companyStyles.appearancePreviewCaption}>
            Prévia do login (ilustrativa)
          </Typography>
          <div className={styles.loginPreviewCard}>
            <div className={styles.loginPreviewBrand}>
              <div
                className={cx(styles.previewMarkFrame, styles.previewMarkFrameSm)}
                data-fit="contain"
                aria-hidden="true"
              >
                <PlatformBrandMark size={48} variant="logo" logoUrl={theme.logoUrl} decorative />
              </div>
              <Typography as="p" variant="label" className={companyStyles.appearancePreviewName}>
                {platformName}
              </Typography>
            </div>
            <div className={styles.loginPreviewField} aria-hidden="true" />
            <div className={styles.loginPreviewField} aria-hidden="true" />
            <Button
              size="sm"
              variant="primary"
              type="button"
              tabIndex={-1}
              className={styles.loginPreviewSubmit}
            >
              Entrar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
