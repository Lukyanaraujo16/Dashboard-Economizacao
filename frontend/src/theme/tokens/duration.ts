import type { DurationTokens } from '../types/foundation';

export const durationTokens = {
  instant: '0ms',
  fast: '120ms',
  normal: '200ms',
  slow: '320ms',
} as const satisfies DurationTokens;
