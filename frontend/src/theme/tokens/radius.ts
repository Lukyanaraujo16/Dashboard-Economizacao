import type { RadiusTokens } from '../types/foundation';

export const radiusTokens = {
  sm: '0.25rem',
  md: '0.5rem',
  lg: '0.75rem',
  xl: '1rem',
  full: '9999px',
} as const satisfies RadiusTokens;
