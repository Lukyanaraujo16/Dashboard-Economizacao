import type { DurationTokens } from '../types/foundation';

export const durationTokens = {
  instant: '0ms',
  fast: '150ms',
  normal: '180ms',
  slow: '280ms',
} as const satisfies DurationTokens;
