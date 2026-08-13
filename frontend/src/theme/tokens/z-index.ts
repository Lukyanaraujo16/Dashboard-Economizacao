import type { ZIndexTokens } from '../types/foundation';

export const zIndexTokens = {
  base: '0',
  dropdown: '100',
  sticky: '200',
  overlay: '300',
  modal: '400',
  toast: '500',
} as const satisfies ZIndexTokens;
