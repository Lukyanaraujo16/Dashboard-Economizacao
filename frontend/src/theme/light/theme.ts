import { structuralTokens } from '../tokens/index';
import type { ThemeFoundation } from '../types/theme';
import { lightColorTokens } from './colors';

export const lightTheme = {
  colors: lightColorTokens,
  ...structuralTokens,
} as const satisfies ThemeFoundation;
