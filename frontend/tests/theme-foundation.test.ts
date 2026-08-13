import { describe, expect, it } from 'vitest';

import { darkColorTokens } from '../src/theme/dark/colors';
import { lightColorTokens } from '../src/theme/light/colors';
import { resolveTheme } from '../src/theme/resolver/resolve-theme';
import { COLOR_TOKEN_NAMES } from '../src/theme/types/colors';
import { applyColorOverrides } from '../src/theme/utils/apply-color-overrides';
import { themeToCssVariables } from '../src/theme/utils/css-variables';

describe('design tokens', () => {
  it('light e dark possuem todos os tokens de cor semânticos', () => {
    for (const name of COLOR_TOKEN_NAMES) {
      expect(lightColorTokens[name]).toBeTypeOf('string');
      expect(lightColorTokens[name].length).toBeGreaterThan(0);
      expect(darkColorTokens[name]).toBeTypeOf('string');
      expect(darkColorTokens[name].length).toBeGreaterThan(0);
    }
  });

  it('light e dark não são idênticos (dark não é inversão vazia)', () => {
    expect(darkColorTokens.background).not.toBe(lightColorTokens.background);
    expect(darkColorTokens.surface).not.toBe(lightColorTokens.surface);
    expect(darkColorTokens.textPrimary).not.toBe(lightColorTokens.textPrimary);
  });
});

describe('resolveTheme', () => {
  it('resolve light e dark conforme preference', () => {
    expect(resolveTheme({ preference: 'light' }).colorScheme).toBe('light');
    expect(resolveTheme({ preference: 'light' }).colors.primary).toBe(lightColorTokens.primary);

    expect(resolveTheme({ preference: 'dark' }).colorScheme).toBe('dark');
    expect(resolveTheme({ preference: 'dark' }).colors.background).toBe(darkColorTokens.background);
  });

  it('system usa systemScheme', () => {
    expect(resolveTheme({ preference: 'system', systemScheme: 'dark' }).colorScheme).toBe('dark');
    expect(resolveTheme({ preference: 'system', systemScheme: 'light' }).colorScheme).toBe('light');
  });

  it('aplica branding permitido e protege cores semânticas críticas', () => {
    const resolved = resolveTheme({
      preference: 'light',
      branding: {
        logoUrl: 'https://cdn.example/logo.svg',
        light: {
          primary: '#112233',
          accent: '#445566',
          danger: '#00FF00',
          success: '#FF0000',
        },
      },
    });

    expect(resolved.logoUrl).toBe('https://cdn.example/logo.svg');
    expect(resolved.colors.primary).toBe('#112233');
    expect(resolved.colors.accent).toBe('#445566');
    expect(resolved.colors.danger).toBe(lightColorTokens.danger);
    expect(resolved.colors.success).toBe(lightColorTokens.success);
  });
});

describe('applyColorOverrides', () => {
  it('ignora overrides vazios e protegidos', () => {
    const next = applyColorOverrides(lightColorTokens, {
      primary: '  ',
      warning: '#111111',
      textMuted: '#222222',
    });

    expect(next.primary).toBe(lightColorTokens.primary);
    expect(next.warning).toBe(lightColorTokens.warning);
    expect(next.textMuted).toBe('#222222');
  });
});

describe('themeToCssVariables', () => {
  it('gera variáveis semânticas sem nomes de marca', () => {
    const theme = resolveTheme({ preference: 'light' });
    const variables = themeToCssVariables(theme);

    expect(variables['--color-background']).toBe(lightColorTokens.background);
    expect(variables['--color-text-primary']).toBe(lightColorTokens.textPrimary);
    expect(variables['--space-4']).toBe('1rem');
    expect(variables['--radius-md']).toBe('0.5rem');
    expect(variables['--theme-color-scheme']).toBe('light');

    const serialized = JSON.stringify(variables);
    expect(serialized.toLowerCase()).not.toContain('economizacao');
    expect(serialized.toLowerCase()).not.toContain('felipe');
  });
});
