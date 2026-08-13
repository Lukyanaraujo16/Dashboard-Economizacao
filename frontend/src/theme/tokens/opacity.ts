import type { OpacityTokens } from '../types/foundation';

export const opacityTokens = {
  disabled: '0.48',
  muted: '0.72',
  overlay: '1',
} as const satisfies OpacityTokens;
