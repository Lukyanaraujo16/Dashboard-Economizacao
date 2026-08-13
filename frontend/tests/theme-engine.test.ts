import { describe, expect, it } from 'vitest';

import {
  mergeBrandingColors,
  MOCK_TENANT_BRANDINGS,
  normalizeBrandingInput,
  runThemeEngine,
} from '../src/theme';
import { darkColorTokens } from '../src/theme/dark/colors';
import { lightColorTokens } from '../src/theme/light/colors';
import { resolveTheme } from '../src/theme/resolver/resolve-theme';

describe('Theme Engine / Branding Runtime', () => {
  it('branding vazio faz fallback para Theme Default', () => {
    expect(normalizeBrandingInput(null)).toBeNull();
    expect(normalizeBrandingInput(undefined)).toBeNull();
    expect(normalizeBrandingInput({})).toBeNull();
    expect(normalizeBrandingInput({ name: '   ', light: { primary: '  ' } })).toBeNull();

    const resolved = runThemeEngine({ preference: 'light', branding: {} });
    expect(resolved.colors.primary).toBe(lightColorTokens.primary);
    expect(resolved.brandName).toBeNull();
    expect(resolved.logoUrl).toBeNull();
  });

  it('branding parcial completa com Theme Default', () => {
    const resolved = resolveTheme({
      preference: 'light',
      branding: {
        name: 'Parcial',
        light: {
          primary: '#112233',
        },
      },
    });

    expect(resolved.brandName).toBe('Parcial');
    expect(resolved.colors.primary).toBe('#112233');
    expect(resolved.colors.secondary).toBe(lightColorTokens.secondary);
    expect(resolved.colors.accent).toBe(lightColorTokens.accent);
    expect(resolved.colors.success).toBe(lightColorTokens.success);
    expect(resolved.spacing).toEqual(resolveTheme({ preference: 'light' }).spacing);
  });

  it('branding completo aplica primary/secondary/accent e nome', () => {
    const resolved = resolveTheme({
      preference: 'light',
      branding: {
        name: 'Completo',
        logoUrl: 'https://cdn.example/logo.svg',
        light: {
          primary: '#010203',
          onPrimary: '#FEFEFE',
          secondary: '#040506',
          accent: '#070809',
        },
      },
    });

    expect(resolved.brandName).toBe('Completo');
    expect(resolved.logoUrl).toBe('https://cdn.example/logo.svg');
    expect(resolved.colors.primary).toBe('#010203');
    expect(resolved.colors.onPrimary).toBe('#FEFEFE');
    expect(resolved.colors.secondary).toBe('#040506');
    expect(resolved.colors.accent).toBe('#070809');
  });

  it('protege success/warning/danger/info/focus/disabled', () => {
    const resolved = resolveTheme({
      preference: 'light',
      branding: {
        light: {
          primary: '#111111',
          success: '#00FF00',
          warning: '#00FF01',
          danger: '#00FF02',
          info: '#00FF03',
          focus: '#00FF04',
          disabled: '#00FF05',
          onDanger: '#00FF06',
        },
      },
    });

    expect(resolved.colors.primary).toBe('#111111');
    expect(resolved.colors.success).toBe(lightColorTokens.success);
    expect(resolved.colors.warning).toBe(lightColorTokens.warning);
    expect(resolved.colors.danger).toBe(lightColorTokens.danger);
    expect(resolved.colors.info).toBe(lightColorTokens.info);
    expect(resolved.colors.focus).toBe(lightColorTokens.focus);
    expect(resolved.colors.disabled).toBe(lightColorTokens.disabled);
    expect(resolved.colors.onDanger).toBe(lightColorTokens.onDanger);
  });

  it('merge ignora tokens fora do allowlist (ex.: background, textMuted)', () => {
    const merged = mergeBrandingColors(lightColorTokens, {
      primary: '#ABCDEF',
      background: '#000000',
      textMuted: '#111111',
      border: '#222222',
    });

    expect(merged.primary).toBe('#ABCDEF');
    expect(merged.background).toBe(lightColorTokens.background);
    expect(merged.textMuted).toBe(lightColorTokens.textMuted);
    expect(merged.border).toBe(lightColorTokens.border);
  });

  it('mocks de tenant mudam primary e preservam success/danger', () => {
    const azul = MOCK_TENANT_BRANDINGS.find((item) => item.id === 'azul');
    expect(azul).toBeTruthy();

    const light = resolveTheme({ preference: 'light', branding: azul!.branding });
    const dark = resolveTheme({ preference: 'dark', branding: azul!.branding });

    expect(light.colors.primary).toBe(azul!.branding!.light!.primary);
    expect(light.colors.primary).not.toBe(lightColorTokens.primary);
    expect(light.colors.success).toBe(lightColorTokens.success);
    expect(light.colors.danger).toBe(lightColorTokens.danger);

    expect(dark.colors.primary).toBe(azul!.branding!.dark!.primary);
    expect(dark.colors.success).toBe(darkColorTokens.success);
    expect(dark.colors.danger).toBe(darkColorTokens.danger);
  });

  it('runThemeEngine equivale a resolveTheme', () => {
    const input = {
      preference: 'dark' as const,
      branding: {
        name: 'Engine',
        dark: { accent: '#F2C200' },
      },
    };

    expect(runThemeEngine(input)).toEqual(resolveTheme(input));
  });
});
