import { normalizeBrandingInput } from '../branding/normalize-branding';
import { darkTheme } from '../dark/theme';
import { lightTheme } from '../light/theme';
import type {
  ResolvedColorScheme,
  ResolvedTheme,
  ResolveThemeInput,
  ThemeFoundation,
} from '../types/theme';
import { applyColorOverrides } from '../utils/apply-color-overrides';

function resolveColorScheme(input: ResolveThemeInput): ResolvedColorScheme {
  if (input.preference === 'system') {
    return input.systemScheme ?? 'light';
  }
  return input.preference;
}

function selectBaseTheme(scheme: ResolvedColorScheme): ThemeFoundation {
  return scheme === 'dark' ? darkTheme : lightTheme;
}

/**
 * Theme Engine resolver:
 * Design Tokens → Theme Default → Branding Runtime (normalizado) → Resolved Theme
 *
 * Branding vazio/incompleto completa com default. Nunca quebra o tema.
 * Spacing / radius / duration / z-index / opacity nunca vêm do branding.
 */
export function resolveTheme(input: ResolveThemeInput): ResolvedTheme {
  const colorScheme = resolveColorScheme(input);
  const base = selectBaseTheme(colorScheme);
  const branding = normalizeBrandingInput(input.branding);
  const schemeOverrides = colorScheme === 'dark' ? branding?.dark : branding?.light;

  return {
    colorScheme,
    preference: input.preference,
    logoUrl: branding?.logoUrl ?? null,
    brandName: branding?.name ?? null,
    colors: applyColorOverrides(base.colors, schemeOverrides),
    spacing: base.spacing,
    radius: base.radius,
    elevation: base.elevation,
    duration: base.duration,
    zIndex: base.zIndex,
    opacity: base.opacity,
  };
}
