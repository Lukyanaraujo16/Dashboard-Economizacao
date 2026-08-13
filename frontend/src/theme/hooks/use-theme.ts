'use client';

import { useContext } from 'react';

import { ThemeContext, type ThemeContextValue } from '../provider/theme-context';

/**
 * API mínima de leitura do tema resolvido.
 * Sem alternância visual nesta subfase.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme deve ser usado dentro de ThemeProvider.');
  }
  return context;
}
