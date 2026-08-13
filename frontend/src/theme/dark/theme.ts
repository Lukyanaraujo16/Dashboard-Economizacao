import { structuralTokens } from '../tokens/index';
import type { ThemeFoundation } from '../types/theme';
import { darkColorTokens } from './colors';

export const darkTheme = {
  colors: darkColorTokens,
  ...structuralTokens,
} as const satisfies ThemeFoundation;
