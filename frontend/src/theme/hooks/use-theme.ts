'use client';

import { useContext } from 'react';

import { ThemeContext, type ThemeContextValue } from '../provider/theme-context';

/**
 * Acesso ao tema resolvido e à preferência ativa.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme deve ser usado dentro de ThemeProvider.');
  }
  return context;
}
