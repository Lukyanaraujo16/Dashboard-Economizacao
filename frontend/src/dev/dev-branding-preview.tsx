import type { CSSProperties } from 'react';

import { Badge, Button, Card, Stack, Typography } from '../components/ui';
import {
  MOCK_TENANT_BRANDINGS,
  resolveTheme,
  themeToCssVariables,
  type MockTenantBranding,
} from '../theme';
import type { ResolvedColorScheme } from '../theme/types/theme';
import styles from './dev-branding-preview.module.css';

type DevBrandingPreviewProps = {
  readonly colorScheme: ResolvedColorScheme;
};

function BrandingPreviewPanel({
  item,
  colorScheme,
}: {
  readonly item: MockTenantBranding;
  readonly colorScheme: ResolvedColorScheme;
}) {
  const theme = resolveTheme({
    preference: colorScheme,
    branding: item.branding,
  });
  const cssVars = themeToCssVariables(theme) as CSSProperties;

  return (
    <div className={styles.panel} style={cssVars} data-theme={theme.colorScheme}>
      <Stack gap={3}>
        <Stack gap={1}>
          <Typography variant="label">{item.label}</Typography>
          <Typography variant="caption">
            {theme.brandName ?? 'Theme Default'} · primary {theme.colors.primary}
          </Typography>
        </Stack>
        <Card>
          <Stack gap={3}>
            <Stack direction="horizontal" gap={2} wrap>
              <Button size="sm" variant="primary">
                Primary
              </Button>
              <Button size="sm" variant="secondary">
                Secondary
              </Button>
            </Stack>
            <Typography variant="numeric" className={styles.accentValue}>
              R$ 9.876,54
            </Typography>
            <Stack direction="horizontal" gap={2} wrap>
              <Badge variant="success">Success</Badge>
              <Badge variant="danger">Danger</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="info">Info</Badge>
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </div>
  );
}

/**
 * Preview DEV do Branding Runtime (mocks locais).
 * Aplica CSS variables no escopo do painel — não altera ThemeProvider global.
 */
export function DevBrandingPreview({ colorScheme }: DevBrandingPreviewProps) {
  return (
    <Stack gap={4}>
      <Typography variant="body">
        Theme Default → Tenant Azul → Verde → Roxo → Vermelho. Overrides apenas primary / secondary
        / accent. Success / danger / warning / info permanecem fixos. Sem backend, sem persistência.
      </Typography>
      <div className={styles.grid}>
        {MOCK_TENANT_BRANDINGS.map((item) => (
          <BrandingPreviewPanel key={item.id} item={item} colorScheme={colorScheme} />
        ))}
      </div>
    </Stack>
  );
}
