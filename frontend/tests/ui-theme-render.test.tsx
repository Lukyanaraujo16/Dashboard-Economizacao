import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Badge, Button, Card, Input, Typography } from '../src/components/ui';
import { ThemeProvider } from '../src/theme';
import { resolveTheme } from '../src/theme/resolver/resolve-theme';
import { themeToCssVariables } from '../src/theme/utils/css-variables';

afterEach(() => {
  cleanup();
});

describe('Theme + componentes', () => {
  it('renderiza em Light e Dark sem quebrar', () => {
    for (const preference of ['light', 'dark'] as const) {
      const { unmount } = render(
        <ThemeProvider preference={preference}>
          <Card>
            <Typography variant="title">Tema {preference}</Typography>
            <Button>Ação</Button>
            <Input aria-label={`campo-${preference}`} />
            <Badge variant="success">ok</Badge>
          </Card>
        </ThemeProvider>,
      );

      expect(screen.getByText(`Tema ${preference}`)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Ação' })).toBeTruthy();
      expect(resolveTheme({ preference }).colorScheme).toBe(preference);
      expect(Object.keys(themeToCssVariables(resolveTheme({ preference }))).length).toBeGreaterThan(
        0,
      );
      unmount();
    }
  });
});
