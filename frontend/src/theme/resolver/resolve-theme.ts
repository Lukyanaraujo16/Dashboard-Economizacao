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
 * Design Tokens → Theme → Tenant Branding (opcional) → Resolved Theme
 */
export function resolveTheme(input: ResolveThemeInput): ResolvedTheme {
  const colorScheme = resolveColorScheme(input);
  const base = selectBaseTheme(colorScheme);
  const branding = input.branding ?? null;
  const schemeOverrides = colorScheme === 'dark' ? branding?.dark : branding?.light;

  return {
    colorScheme,
    preference: input.preference,
    logoUrl: branding?.logoUrl ?? null,
    colors: applyColorOverrides(base.colors, schemeOverrides),
    spacing: base.spacing,
    radius: base.radius,
    elevation: base.elevation,
    duration: base.duration,
    zIndex: base.zIndex,
    opacity: base.opacity,
  };
}
