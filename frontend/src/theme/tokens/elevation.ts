import type { ElevationTokens } from '../types/foundation';

/** Sombras discretas — dark mode usa valores próprios no tema de cores + estas bases. */
export const elevationTokens = {
  none: 'none',
  sm: '0 1px 2px var(--color-shadow)',
  md: '0 4px 14px var(--color-shadow)',
  lg: '0 12px 28px var(--color-shadow)',
} as const satisfies ElevationTokens;
