import { COLOR_TOKEN_NAMES } from '../types/colors';
import {
  DURATION_TOKEN_NAMES,
  ELEVATION_TOKEN_NAMES,
  OPACITY_TOKEN_NAMES,
  RADIUS_TOKEN_NAMES,
  SPACING_SCALE_KEYS,
  Z_INDEX_TOKEN_NAMES,
} from '../types/foundation';
import type { ResolvedTheme } from '../types/theme';

function toKebabCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Mapa de variáveis CSS semânticas derivadas do tema resolvido.
 * Componentes futuros consomem apenas estas variáveis.
 */
export function themeToCssVariables(theme: ResolvedTheme): Record<string, string> {
  const variables: Record<string, string> = {
    '--theme-color-scheme': theme.colorScheme,
  };

  for (const name of COLOR_TOKEN_NAMES) {
    variables[`--color-${toKebabCase(name)}`] = theme.colors[name];
  }

  for (const key of SPACING_SCALE_KEYS) {
    variables[`--space-${key}`] = theme.spacing[key];
  }

  for (const name of RADIUS_TOKEN_NAMES) {
    variables[`--radius-${name}`] = theme.radius[name];
  }

  for (const name of ELEVATION_TOKEN_NAMES) {
    variables[`--elevation-${name}`] = theme.elevation[name];
  }

  for (const name of DURATION_TOKEN_NAMES) {
    variables[`--duration-${name}`] = theme.duration[name];
  }

  for (const name of Z_INDEX_TOKEN_NAMES) {
    variables[`--z-${name}`] = theme.zIndex[name];
  }

  for (const name of OPACITY_TOKEN_NAMES) {
    variables[`--opacity-${name}`] = theme.opacity[name];
  }

  return variables;
}

export function applyCssVariables(target: HTMLElement, variables: Record<string, string>): void {
  for (const [name, value] of Object.entries(variables)) {
    target.style.setProperty(name, value);
  }
}
